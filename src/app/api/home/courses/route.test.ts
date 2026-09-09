import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");

test("홈 코스 API는 성공 응답만 60초 공개 캐시하고 처리 시간을 표시한다", async () => {
  const routeModule = { exports: {} as { GET: () => Promise<Response> } };
  let shouldFail = false;
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse: Response },
    "@/lib/supabase/admin": { createAdminClient: () => ({ client: "admin" }) },
    "@/lib/supabase/tables": {
      T: {
        course: "tb_course",
        courseDetail: "tb_course_detail",
        courseLikes: "tb_course_like",
        boardPosts: "tb_post",
        place: "tb_place"
      }
    },
    "@/features/home/server/homeCourseSummary": {
      loadHomeCourseSummaries: async (queries: Record<string, unknown>) => {
        assert.deepEqual(Object.keys(queries).sort(), [
          "loadCourses",
          "loadDetails",
          "loadLikes",
          "loadPlaces",
          "loadRatings"
        ]);
        if (shouldFail) throw new Error("database unavailable");
        return [{ course_id: 1, course_nm: "공개 코스", places: [] }];
      }
    }
  };

  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText,
    {
      module: routeModule,
      exports: routeModule.exports,
      require: (id: string) => {
        assert.ok(id in dependencies, `Unexpected dependency: ${id}`);
        return dependencies[id];
      },
      Response,
      performance
    }
  );

  const success = await routeModule.exports.GET();
  assert.equal(success.status, 200);
  assert.equal(success.headers.get("cache-control"), "public, max-age=0, must-revalidate");
  assert.equal(
    success.headers.get("vercel-cdn-cache-control"),
    "public, s-maxage=60, stale-while-revalidate=60"
  );
  assert.match(success.headers.get("server-timing") ?? "", /^home_courses;dur=\d+(?:\.\d)?$/);
  assert.deepEqual(await success.json(), {
    items: [{ course_id: 1, course_nm: "공개 코스", places: [] }]
  });

  shouldFail = true;
  const failure = await routeModule.exports.GET();
  assert.equal(failure.status, 500);
  assert.equal(failure.headers.get("cache-control"), "private, no-store");
  assert.equal(failure.headers.get("vercel-cdn-cache-control"), "no-store");
  assert.match(failure.headers.get("server-timing") ?? "", /^home_courses;dur=\d+(?:\.\d)?$/);
  assert.deepEqual(await failure.json(), { error: "홈 인기 코스를 불러오지 못했습니다." });
});
