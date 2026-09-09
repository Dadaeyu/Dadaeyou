import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import * as homeData from "../../../features/home/homeData.ts";
import * as requestPolicy from "./request-policy.ts";

const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");

test("홈 API는 이전 좌표와 가까운 순 요청을 무시하고 일반 추천 조건만 전달한다", async () => {
  const calls: unknown[] = [];
  const routeModule = { exports: {} as { GET: (request: Request) => Promise<Response> } };
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse: Response },
    "@/features/home/homeData": homeData,
    "./request-policy": requestPolicy,
    "@/features/home/server/loadHomePlaces": {
      loadHomePlaces: async (options: unknown) => {
        calls.push(options);
        return { places: [], festivals: [], source: "test" };
      },
      HomeDataError: class extends Error {}
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
      URL
    }
  );
  const base = "http://localhost/api/home?needs=step_free&seed=42&exclude=place-1&q=공원";
  for (const url of [base, `${base}&lat=36.35&lng=127.38`]) {
    const response = await routeModule.exports.GET(new Request(url));
    assert.equal(response.status, 200);
  }
  const normalizedCalls = JSON.parse(JSON.stringify(calls));
  assert.deepEqual(normalizedCalls[0], {
    needIds: ["step_free"],
    query: "공원",
    recommendationSeed: 42,
    excludedPlaceIds: ["place-1"]
  });
  assert.deepEqual(normalizedCalls[1], normalizedCalls[0]);
  // 오래된 클라이언트가 보낸 위치 기반 조건만으로는 필터가 생기지 않는다.
  await routeModule.exports.GET(new Request("http://localhost/api/home?needs=short_distance"));
  assert.deepEqual(JSON.parse(JSON.stringify(calls[2])), {
    needIds: [],
    query: "",
    excludedPlaceIds: []
  });
});
