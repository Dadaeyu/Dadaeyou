import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as discoveryPlaceData from "./discoveryPlaceData.ts";

const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");

test("공개 인기 장소 성공 응답은 60초 CDN 캐시를 허용한다", async () => {
  const route = loadRoute({
    createClient: () => createSupabaseStub()
  });

  const response = await route.GET();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "public, max-age=0, must-revalidate");
  assert.equal(
    response.headers.get("Vercel-CDN-Cache-Control"),
    "public, s-maxage=60, stale-while-revalidate=60"
  );
  assert.doesNotMatch(response.headers.get("Cache-Control") ?? "", /private/u);
  assert.equal(response.headers.get("Set-Cookie"), null);
  assert.deepEqual(Object.keys((await response.json()) as object).sort(), [
    "favoritePlaces",
    "places",
    "reviewPlaces"
  ]);
});

test("공개 인기 장소 오류 응답은 저장하지 않는다", async () => {
  const route = loadRoute({
    createClient: () => {
      throw new Error("database unavailable");
    }
  });

  const response = await route.GET();

  assert.equal(response.status, 500);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("Vercel-CDN-Cache-Control"), null);
});

function loadRoute({ createClient }: { createClient: () => unknown }) {
  const routeModule = {
    exports: {} as { GET: () => Promise<Response> }
  };
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse: Response },
    "@/lib/theme/bakeryTheme": { BAKERY_THEME_CODE: "BK" },
    "./discoveryPlaceData": discoveryPlaceData,
    "@/lib/supabase/public": { createPublicClient: createClient }
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
      Set
    }
  );

  return routeModule.exports;
}

function createSupabaseStub() {
  return {
    from(table: string) {
      return createQuery(table === "tb_place" ? [] : []);
    }
  };
}

function createQuery(data: unknown[]) {
  const result = Promise.resolve({ data, error: null });
  const query = {
    eq: () => query,
    in: () => query,
    not: () => query,
    or: () => query,
    select: () => query,
    then: result.then.bind(result)
  };
  return query;
}
