import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchCurrentWeather,
  getUltraShortNowcastBaseTime,
  KMA_CURRENT_WEATHER_TIMEOUT_MS,
  type CurrentWeatherRuntime
} from "./current-weather.ts";

const ENV_KEYS = [
  "KMA_CURRENT_WEATHER_SERVICE_KEY",
  "KMA_CURRENT_WEATHER_ENABLED",
  "KMA_CURRENT_WEATHER_NX",
  "KMA_CURRENT_WEATHER_NY",
  "KMA_TOUR_WEATHER_SERVICE_KEY",
  "TOUR_WEATHER_SERVICE_KEY",
  "TOUR_API_SERVICE_KEY"
] as const;

async function withCurrentWeatherEnv<T>(
  env: Partial<Record<(typeof ENV_KEYS)[number], string>>,
  run: () => T | Promise<T>
) {
  const previous = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, env);

  try {
    return await run();
  } finally {
    for (const key of ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("초단기실황 fetch는 대전 격자와 bounded timeout signal을 전달한다", async () => {
  await withCurrentWeatherEnv({ KMA_CURRENT_WEATHER_SERVICE_KEY: "service-key" }, async () => {
    const signal = new AbortController().signal;
    const runtime: CurrentWeatherRuntime = {
      createTimeoutSignal(timeoutMs) {
        assert.equal(timeoutMs, KMA_CURRENT_WEATHER_TIMEOUT_MS);
        return signal;
      },
      async fetch(url, init) {
        assert.match(url, /getUltraSrtNcst/u);
        assert.match(url, /nx=67/u);
        assert.match(url, /ny=100/u);
        assert.equal(init.signal, signal);
        return new Response(
          JSON.stringify({
            response: {
              body: {
                items: {
                  item: [
                    {
                      baseDate: "20260906",
                      baseTime: "0900",
                      category: "T1H",
                      nx: "67",
                      ny: "100",
                      obsrValue: "27.4"
                    },
                    {
                      baseDate: "20260906",
                      baseTime: "0900",
                      category: "REH",
                      nx: "67",
                      ny: "100",
                      obsrValue: "61"
                    },
                    {
                      baseDate: "20260906",
                      baseTime: "0900",
                      category: "PTY",
                      nx: "67",
                      ny: "100",
                      obsrValue: "1"
                    },
                    {
                      baseDate: "20260906",
                      baseTime: "0900",
                      category: "RN1",
                      nx: "67",
                      ny: "100",
                      obsrValue: "1.0mm"
                    },
                    {
                      baseDate: "20260906",
                      baseTime: "0900",
                      category: "WSD",
                      nx: "67",
                      ny: "100",
                      obsrValue: "2.8"
                    }
                  ]
                }
              },
              header: { resultCode: "00" }
            }
          }),
          { headers: { "content-type": "application/json" } }
        );
      },
      now: () => new Date("2026-09-06T00:50:00.000Z")
    };

    const result = await fetchCurrentWeather(runtime);

    assert.equal(result.status, "ready");
    assert.equal(result.condition?.area, "대전광역시");
    assert.equal(result.condition?.temperatureC, 27.4);
    assert.equal(result.condition?.humidityPercent, 61);
    assert.equal(result.condition?.precipitation, "rain");
    assert.equal(result.condition?.rainfallMm, 1);
    assert.equal(result.condition?.windSpeedMs, 2.8);
    assert.equal(result.condition?.observedAt, "2026-09-06 09시");
  });
});

test("초단기실황은 응답 원본 시각과 격자가 요청과 다르면 empty로 처리한다", async () => {
  await withCurrentWeatherEnv({ KMA_CURRENT_WEATHER_SERVICE_KEY: "service-key" }, async () => {
    const stale = await fetchCurrentWeather({
      fetch: async () =>
        currentWeatherResponse([
          {
            baseDate: "20260905",
            baseTime: "0800",
            category: "T1H",
            nx: "67",
            ny: "100",
            obsrValue: "27.4"
          }
        ]),
      now: () => new Date("2026-09-06T00:50:00.000Z")
    });
    const wrongGrid = await fetchCurrentWeather({
      fetch: async () =>
        currentWeatherResponse([
          {
            baseDate: "20260906",
            baseTime: "0900",
            category: "T1H",
            nx: "60",
            ny: "127",
            obsrValue: "27.4"
          }
        ]),
      now: () => new Date("2026-09-06T00:50:00.000Z")
    });

    assert.equal(stale.status, "empty");
    assert.equal(stale.condition, null);
    assert.equal(wrongGrid.status, "empty");
    assert.equal(wrongGrid.condition, null);
  });
});

test("초단기실황은 사용할 수 있는 날씨 metric이 없으면 empty로 처리한다", async () => {
  await withCurrentWeatherEnv({ KMA_CURRENT_WEATHER_SERVICE_KEY: "service-key" }, async () => {
    const result = await fetchCurrentWeather({
      fetch: async () =>
        currentWeatherResponse([
          {
            baseDate: "20260906",
            baseTime: "0900",
            category: "UNKNOWN",
            nx: "67",
            ny: "100",
            obsrValue: "unused"
          }
        ]),
      now: () => new Date("2026-09-06T00:50:00.000Z")
    });

    assert.equal(result.status, "empty");
    assert.equal(result.condition, null);
  });
});

test("초단기실황 기준 시각은 45분 전이면 직전 정시를 사용한다", () => {
  assert.deepEqual(getUltraShortNowcastBaseTime(new Date("2026-09-05T15:30:00.000Z")), {
    baseDate: "20260905",
    baseTime: "2300"
  });
  assert.deepEqual(getUltraShortNowcastBaseTime(new Date("2026-09-06T00:50:00.000Z")), {
    baseDate: "20260906",
    baseTime: "0900"
  });
});

function currentWeatherResponse(items: Array<Record<string, string>>) {
  return new Response(
    JSON.stringify({
      response: {
        body: {
          items: { item: items }
        },
        header: { resultCode: "00" }
      }
    }),
    { headers: { "content-type": "application/json" } }
  );
}

test("초단기실황 실패는 unavailable degradation을 유지한다", async () => {
  await withCurrentWeatherEnv({ KMA_CURRENT_WEATHER_SERVICE_KEY: "service-key" }, async () => {
    const result = await fetchCurrentWeather({
      createTimeoutSignal: () => new AbortController().signal,
      fetch: async () => {
        throw new DOMException("The operation was aborted.", "AbortError");
      },
      timeoutMs: 10
    });

    assert.equal(result.status, "unavailable");
    assert.equal(result.message, "기상청 현재 날씨 API 연결 실패");
  });
});
