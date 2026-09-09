import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");

test("공개 필터 옵션 성공 응답은 300초 CDN 캐시를 허용한다", async () => {
  const response = await loadRoute(createSupabaseStub()).GET();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=0, must-revalidate");
  assert.equal(
    response.headers.get("Vercel-CDN-Cache-Control"),
    "public, s-maxage=300, stale-while-revalidate=300"
  );
  assert.equal(response.headers.get("Set-Cookie"), null);
});

test("공개 필터 옵션 오류 응답은 저장하지 않는다", async () => {
  const response = await loadRoute(createSupabaseStub({ message: "database unavailable" })).GET();

  assert.equal(response.status, 500);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("Vercel-CDN-Cache-Control"), null);
});

function loadRoute(supabase: unknown) {
  const routeModule = { exports: {} as { GET: () => Promise<Response> } };
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText,
    {
      module: routeModule,
      exports: routeModule.exports,
      require: (id: string) => {
        assert.equal(id, "@/lib/supabase/public");
        return { createPublicClient: () => supabase };
      },
      Response
    }
  );
  return routeModule.exports;
}

function createSupabaseStub(error: { message: string } | null = null) {
  return {
    from() {
      return createQuery(error);
    }
  };
}

function createQuery(error: { message: string } | null) {
  const result = Promise.resolve({ data: [], error });
  const query = {
    eq: () => query,
    not: () => query,
    order: () => query,
    select: () => query,
    then: result.then.bind(result)
  };
  return query;
}
