import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");

test("current-only 날씨 요청은 관광 날씨 공급자를 호출하지 않고 현재 실황을 5분 캐시한다", async () => {
  let tourCalls = 0;
  const route = loadRoute({
    fetchCurrentWeather: async () => currentWeather("ready"),
    fetchTourWeather: async () => {
      tourCalls += 1;
      return tourWeather();
    }
  });

  const response = await route.GET(new Request("http://localhost/api/weather?mode=current"));
  const payload = (await response.json()) as { currentWeather?: { status?: string } };

  assert.equal(response.status, 200);
  assert.equal(tourCalls, 0);
  assert.equal(payload.currentWeather?.status, "ready");
  assert.equal(
    response.headers.get("Vercel-CDN-Cache-Control"),
    "public, s-maxage=300, stale-while-revalidate=60"
  );
  assert.match(response.headers.get("Server-Timing") ?? "", /^weather;dur=/u);
});

test("현재 실황 fallback 응답은 저장하지 않는다", async () => {
  const route = loadRoute({
    fetchCurrentWeather: async () => currentWeather("unavailable"),
    fetchTourWeather: async () => tourWeather()
  });

  const response = await route.GET(new Request("http://localhost/api/weather?mode=current"));

  assert.equal(response.headers.get("Cache-Control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("Vercel-CDN-Cache-Control"), null);
});

test("기존 날씨 요청은 관광 날씨와 현재 실황을 함께 반환한다", async () => {
  let tourCalls = 0;
  const route = loadRoute({
    fetchCurrentWeather: async () => currentWeather("ready"),
    fetchTourWeather: async () => {
      tourCalls += 1;
      return tourWeather();
    }
  });

  const response = await route.GET(new Request("http://localhost/api/weather?location=대전"));
  const payload = (await response.json()) as { items?: unknown[]; status?: string };

  assert.equal(tourCalls, 1);
  assert.equal(payload.status, "ready");
  assert.equal(payload.items?.length, 1);
});

test("기존 결합 날씨에서 한 공급자라도 실패하면 공유 캐시하지 않는다", async () => {
  for (const status of ["unavailable", "not_configured", "empty"]) {
    const route = loadRoute({
      fetchCurrentWeather: async () => currentWeather("ready"),
      fetchTourWeather: async () => ({ ...tourWeather(), status })
    });
    const response = await route.GET(new Request("http://localhost/api/weather"));
    assert.equal(response.headers.get("Cache-Control"), "private, no-store, max-age=0", status);
    assert.equal(response.headers.get("Vercel-CDN-Cache-Control"), null, status);
  }
});

test("관광 날씨를 의도적으로 생략한 정상 실황은 캐시할 수 있다", async () => {
  const route = loadRoute({
    fetchCurrentWeather: async () => currentWeather("ready"),
    fetchTourWeather: async () => ({ ...tourWeather(), status: "not_requested" })
  });
  const response = await route.GET(
    new Request("http://localhost/api/weather?weatherSensitive=false")
  );
  assert.ok(response.headers.get("Vercel-CDN-Cache-Control")?.includes("s-maxage=300"));
});

function loadRoute({
  fetchCurrentWeather,
  fetchTourWeather
}: {
  fetchCurrentWeather: () => Promise<unknown>;
  fetchTourWeather: () => Promise<unknown>;
}) {
  const routeModule = {
    exports: {} as { GET: (request: Request) => Promise<Response> }
  };
  const dependencies: Record<string, unknown> = {
    "next/server": { NextResponse: Response },
    "@/lib/current-weather": { fetchCurrentWeather },
    "@/lib/tour-weather": { fetchTourWeather }
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
      Date,
      Request,
      Response,
      URL
    }
  );
  return routeModule.exports;
}

function currentWeather(status: "ready" | "unavailable") {
  return {
    condition:
      status === "ready"
        ? {
            area: "대전광역시",
            humidityPercent: 60,
            observedAt: "2026-09-09 22시",
            precipitation: "none",
            rainfallMm: 0,
            source: "current source",
            temperatureC: 24,
            windSpeedMs: 1
          }
        : null,
    debug: { condition: null, source: "current source", status, statusMessage: status },
    message: status,
    source: "current source",
    status
  };
}

function tourWeather() {
  const items = [
    {
      cityAreaId: "1100",
      cityName: "대전",
      doName: "대전광역시",
      kmaTci: "70",
      tciGrade: "좋음",
      tm: "2026090922",
      totalCityName: "대전광역시"
    }
  ];
  return {
    debug: { items, source: "tour source", status: "ready", statusMessage: "ready" },
    items,
    message: "ready",
    source: "tour source",
    status: "ready"
  };
}
