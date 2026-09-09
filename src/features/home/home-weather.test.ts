import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHomeWeatherNotice,
  getHomeSeasonAdvice,
  isFreshDaejeonCurrentWeatherCondition,
  isFreshDaejeonWeatherItem,
  type HomeWeatherApiPayload
} from "./home-weather.ts";

test("home weather uses current Daejeon conditions as the primary travel signal", () => {
  const notice = buildHomeWeatherNotice(
    weatherPayload({
      currentWeather: currentWeatherPayload({
        precipitation: "rain",
        rainfallMm: 1,
        temperatureC: 27.4
      }),
      items: [
        {
          cityAreaId: "1100",
          cityName: "대전",
          doName: "대전광역시",
          kmaTci: "67",
          tciGrade: "좋음",
          tm: "2026090509",
          totalCityName: "대전광역시"
        }
      ],
      status: "ready"
    }),
    new Date("2026-09-05T01:00:00.000Z")
  );

  assert.equal(notice.weather.status, "ready");
  assert.equal(notice.weather.area, "대전광역시");
  assert.equal(notice.weather.indexLabel, "27.4℃ · 습도 61% · 바람 2.8m/s");
  assert.equal(notice.weather.gradeLabel, "비 · 1시간 강수 1mm");
  assert.match(notice.weather.gradeAdvice ?? "", /실내 관광지와 짧은 보행 동선/u);
  assert.equal(notice.weather.observedAt, "2026-09-05 09시");
  assert.equal(notice.weather.source, "기상청 단기예보 조회서비스 초단기실황");
  assert.equal(notice.weather.tourismClimateLabel, "관광기후지수 67 · 등급 좋음");
  assert.match(notice.weather.note, /현재 날씨에 맞춰/u);
});

test("home weather falls back to tourism climate advice only after current weather is clear", () => {
  const numericGrade = buildHomeWeatherNotice(
    weatherPayload({
      currentWeather: currentWeatherPayload({ precipitation: "none", temperatureC: 22 }),
      items: [
        {
          cityAreaId: "1100",
          cityName: "대전",
          doName: "대전광역시",
          kmaTci: "67",
          tciGrade: "2",
          tm: "2026090509",
          totalCityName: "대전광역시"
        }
      ],
      status: "ready"
    }),
    new Date("2026-09-05T01:00:00.000Z")
  );
  const spacedGrade = buildHomeWeatherNotice(
    weatherPayload({
      currentWeather: currentWeatherPayload({ precipitation: "none", temperatureC: 22 }),
      items: [
        {
          cityAreaId: "1100",
          cityName: "대전",
          doName: "대전광역시",
          kmaTci: "45",
          tciGrade: " 특보 발령 주의 ",
          tm: "2026090509",
          totalCityName: "대전광역시"
        }
      ],
      status: "ready"
    }),
    new Date("2026-09-05T01:00:00.000Z")
  );

  assert.equal(numericGrade.weather.status, "ready");
  assert.match(numericGrade.weather.gradeAdvice ?? "", /큰 강수 신호가 없어요/u);
  assert.equal(spacedGrade.weather.status, "ready");
  assert.match(spacedGrade.weather.gradeAdvice ?? "", /특보에 유의/u);
});

test("home weather rejects stale or non-Daejeon tourism-climate data", () => {
  assert.equal(
    isFreshDaejeonWeatherItem(
      {
        cityAreaId: null,
        cityName: "대전",
        doName: "대전광역시",
        kmaTci: "75",
        tciGrade: null,
        tm: "2026090409",
        totalCityName: "대전광역시"
      },
      new Date("2026-09-05T01:00:00.000Z")
    ),
    false
  );
  assert.equal(
    isFreshDaejeonWeatherItem(
      {
        cityAreaId: null,
        cityName: "서울",
        doName: "서울특별시",
        kmaTci: "75",
        tciGrade: null,
        tm: "2026090509",
        totalCityName: "서울특별시"
      },
      new Date("2026-09-05T01:00:00.000Z")
    ),
    false
  );
});

test("home weather falls back transparently when current weather is unavailable", () => {
  const unavailable = buildHomeWeatherNotice(
    weatherPayload({
      currentWeather: {
        condition: null,
        message: "기상청 현재 날씨 API 연결 실패",
        source: "기상청 단기예보 조회서비스 초단기실황",
        status: "unavailable"
      },
      items: [],
      status: "unavailable",
      message: "기상청 관광 날씨 API 연결 실패"
    }),
    new Date("2026-09-05T01:00:00.000Z")
  );
  const climateOnly = buildHomeWeatherNotice(
    weatherPayload({
      items: [
        {
          cityAreaId: null,
          cityName: "대전",
          doName: "대전광역시",
          kmaTci: "72",
          tciGrade: "좋음",
          tm: "2026090409",
          totalCityName: "대전광역시"
        }
      ],
      status: "ready"
    }),
    new Date("2026-09-05T01:00:00.000Z")
  );

  assert.equal(unavailable.weather.status, "fallback");
  assert.equal(
    unavailable.weather.forecastHref,
    "https://www.weather.go.kr/w/weather/forecast/short-term.do"
  );
  assert.match(unavailable.weather.message, /현재 대전 날씨를 불러오지 못했어요/u);
  assert.equal(climateOnly.weather.status, "fallback");
  assert.match(climateOnly.weather.message, /현재 대전 날씨/u);
  assert.doesNotMatch(unavailable.weather.message, /API|권한|403/u);
});

test("home weather rejects stale or non-Daejeon current weather payloads", () => {
  const stale = currentWeatherPayload({
    observedAt: "2026-09-04 09시",
    precipitation: "none",
    temperatureC: 22
  });
  const wrongArea = currentWeatherPayload({
    area: "서울특별시",
    observedAt: "2026-09-05 09시",
    precipitation: "none",
    temperatureC: 22
  });

  assert.equal(
    isFreshDaejeonCurrentWeatherCondition(stale.condition!, new Date("2026-09-05T01:00:00.000Z")),
    false
  );
  assert.equal(
    isFreshDaejeonCurrentWeatherCondition(
      wrongArea.condition!,
      new Date("2026-09-05T01:00:00.000Z")
    ),
    false
  );
  assert.equal(
    buildHomeWeatherNotice(
      weatherPayload({ currentWeather: stale, items: [], status: "empty" }),
      new Date("2026-09-05T01:00:00.000Z")
    ).weather.status,
    "fallback"
  );
  assert.equal(
    buildHomeWeatherNotice(
      weatherPayload({ currentWeather: wrongArea, items: [], status: "empty" }),
      new Date("2026-09-05T01:00:00.000Z")
    ).weather.status,
    "fallback"
  );
});

test("home weather does not claim no precipitation signal when precipitation is unknown", () => {
  const notice = buildHomeWeatherNotice(
    weatherPayload({
      currentWeather: currentWeatherPayload({ precipitation: "unknown", temperatureC: 22 }),
      items: [],
      status: "empty"
    }),
    new Date("2026-09-05T01:00:00.000Z")
  );

  assert.equal(notice.weather.status, "ready");
  assert.match(notice.weather.gradeAdvice ?? "", /강수 형태를 확인하지 못했어요/u);
  assert.doesNotMatch(notice.weather.gradeAdvice ?? "", /큰 강수 신호가 없어요/u);
});

test("home seasonal advice stays simple and travel-focused", () => {
  assert.match(getHomeSeasonAdvice(new Date("2026-01-10T00:00:00.000Z")).summary, /겨울/u);
  assert.match(getHomeSeasonAdvice(new Date("2026-08-10T00:00:00.000Z")).tips[0], /그늘/u);
  assert.match(getHomeSeasonAdvice(new Date("2026-10-10T00:00:00.000Z")).tips[0], /해가 짧아/u);
});

function weatherPayload({
  currentWeather,
  items,
  message = "대전 관광기후지수 1건 사용",
  status
}: {
  currentWeather?: HomeWeatherApiPayload["currentWeather"];
  items: HomeWeatherApiPayload["items"];
  message?: string;
  status: HomeWeatherApiPayload["status"];
}): HomeWeatherApiPayload {
  return {
    debug: {
      items,
      source: "기상청 관광코스별 관광지 상세 날씨 조회서비스",
      status,
      statusMessage: message
    },
    items,
    message,
    ok: status === "ready",
    source: "기상청 관광코스별 관광지 상세 날씨 조회서비스",
    status,
    currentWeather
  };
}

function currentWeatherPayload({
  area = "대전광역시",
  observedAt = "2026-09-05 09시",
  precipitation,
  rainfallMm = 0,
  temperatureC
}: {
  area?: string;
  observedAt?: string;
  precipitation: NonNullable<
    NonNullable<HomeWeatherApiPayload["currentWeather"]>["condition"]
  >["precipitation"];
  rainfallMm?: number | null;
  temperatureC: number | null;
}): NonNullable<HomeWeatherApiPayload["currentWeather"]> {
  return {
    condition: {
      area,
      humidityPercent: 61,
      observedAt,
      precipitation,
      rainfallMm,
      source: "기상청 단기예보 조회서비스 초단기실황",
      temperatureC,
      windSpeedMs: 2.8
    },
    message: "대전 현재 날씨 실황 사용",
    source: "기상청 단기예보 조회서비스 초단기실황",
    status: "ready"
  };
}
