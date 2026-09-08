export type HomeWeatherStatus =
  "not_requested" | "not_configured" | "ready" | "empty" | "unavailable";

export type HomeWeatherItem = {
  cityAreaId: string | null;
  cityName: string | null;
  doName: string | null;
  kmaTci: string | null;
  tciGrade: string | null;
  tm: string | null;
  totalCityName: string | null;
};

export type HomeWeatherApiPayload = {
  currentWeather?: {
    condition: {
      area: string;
      humidityPercent: number | null;
      observedAt: string;
      precipitation: "none" | "rain" | "rain_snow" | "snow" | "shower" | "unknown";
      rainfallMm: number | null;
      source: string;
      temperatureC: number | null;
      windSpeedMs: number | null;
    } | null;
    message: string;
    source: string;
    status: "not_configured" | "ready" | "empty" | "unavailable";
  };
  debug?: {
    items?: HomeWeatherItem[];
    source?: string;
    status?: HomeWeatherStatus;
    statusMessage?: string;
  };
  items?: HomeWeatherItem[];
  message?: string;
  ok?: boolean;
  source?: string;
  status?: HomeWeatherStatus;
};

export type HomeSeasonAdvice = {
  season: "spring" | "summer" | "autumn" | "winter";
  summary: string;
  tips: string[];
};

export type HomeWeatherNotice =
  | {
      season: HomeSeasonAdvice;
      weather: {
        area: string;
        forecastHref: typeof OFFICIAL_FORECAST_HREF;
        gradeAdvice: string | null;
        gradeLabel: string | null;
        indexLabel: string | null;
        message: string;
        note: string;
        observedAt: string;
        tourismClimateLabel: string | null;
        source: string;
        status: "ready";
      };
    }
  | {
      season: HomeSeasonAdvice;
      weather: {
        forecastHref: typeof OFFICIAL_FORECAST_HREF;
        message: string;
        status: "fallback";
      };
    };

export const OFFICIAL_FORECAST_HREF = "https://www.weather.go.kr/w/weather/forecast/short-term.do";
export const HOME_WEATHER_TIMEOUT_MS = 10_000;

export function getHomeSeasonAdvice(date = new Date()): HomeSeasonAdvice {
  const month = date.getMonth() + 1;

  if (month >= 3 && month <= 5) {
    return {
      season: "spring",
      summary: "봄에는 일교차와 꽃가루를 함께 확인하세요.",
      tips: [
        "얇은 겉옷을 준비하고 쉬는 시간을 중간에 넣어 보세요.",
        "야외 이동 전 미세먼지와 꽃가루 예보를 확인하세요."
      ]
    };
  }

  if (month >= 6 && month <= 8) {
    return {
      season: "summer",
      summary: "여름에는 그늘과 실내 휴식 지점을 먼저 정해 두세요.",
      tips: [
        "그늘진 길과 실내 휴식 장소를 코스 중간에 넣어 보세요.",
        "물을 챙기고 한낮의 긴 야외 이동은 줄여 보세요."
      ]
    };
  }

  if (month >= 9 && month <= 11) {
    return {
      season: "autumn",
      summary: "가을에는 해가 짧아지는 시간을 고려하세요.",
      tips: [
        "해가 짧아지니 귀가 교통편과 조명을 미리 확인하세요.",
        "야외 코스는 바람을 피할 수 있는 실내 후보를 함께 준비하세요."
      ]
    };
  }

  return {
    season: "winter",
    summary: "겨울에는 추위와 미끄러운 길을 먼저 확인하세요.",
    tips: [
      "장갑과 따뜻한 겉옷을 챙기고 실내 휴식 시간을 넉넉히 잡아 보세요.",
      "눈이나 결빙 예보가 있으면 경사로와 야외 데크 이동을 줄여 보세요."
    ]
  };
}

export function buildHomeWeatherNotice(
  payload: HomeWeatherApiPayload | null | undefined,
  now = new Date()
): HomeWeatherNotice {
  const season = getHomeSeasonAdvice(now);
  const item = (payload?.items ?? []).find((candidate) =>
    isFreshDaejeonWeatherItem(candidate, now)
  );
  const currentCondition = payload?.currentWeather?.condition ?? null;

  if (
    payload?.currentWeather?.status !== "ready" ||
    !currentCondition ||
    !isFreshDaejeonCurrentWeatherCondition(currentCondition, now)
  ) {
    return {
      season,
      weather: {
        forecastHref: OFFICIAL_FORECAST_HREF,
        message: "현재 대전 날씨를 불러오지 못했어요. 방문 전 공식 예보를 확인하세요.",
        status: "fallback"
      }
    };
  }

  const area =
    currentCondition.area ||
    item?.totalCityName ||
    [item?.doName, item?.cityName].filter(Boolean).join(" ") ||
    item?.cityName ||
    "대전";
  const currentSummary = formatCurrentWeatherSummary(currentCondition);
  const tourismClimateLabel =
    payload?.status === "ready" && item
      ? [
          item.kmaTci ? `관광기후지수 ${item.kmaTci}` : null,
          item.tciGrade ? `등급 ${item.tciGrade}` : null
        ]
          .filter(Boolean)
          .join(" · ") || null
      : null;

  return {
    season,
    weather: {
      area,
      forecastHref: OFFICIAL_FORECAST_HREF,
      gradeAdvice: buildCurrentWeatherAdvice(currentCondition, item?.tciGrade),
      gradeLabel: formatPrecipitationLabel(
        currentCondition.precipitation,
        currentCondition.rainfallMm
      ),
      indexLabel: currentSummary,
      message: "기상청 초단기실황으로 현재 대전 날씨를 확인했어요.",
      note: "현재 날씨에 맞춰 야외 이동, 실내 대체 코스, 휴식 지점을 함께 확인하세요.",
      observedAt: currentCondition.observedAt,
      tourismClimateLabel,
      source:
        currentCondition.source ||
        payload.currentWeather.source ||
        "기상청 단기예보 조회서비스 초단기실황",
      status: "ready"
    }
  };
}

export function isFreshDaejeonWeatherItem(item: HomeWeatherItem, now = new Date()) {
  if (!isDaejeonWeatherItem(item)) return false;
  if (!item.tm || !/^\d{10}$/.test(item.tm)) return false;
  return item.tm.slice(0, 8) === formatKoreanDate(now);
}

export function formatWeatherTime(value: string | null | undefined) {
  if (!value || !/^\d{10}$/.test(value)) return "제공 시각 미확인";
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)} ${value.slice(8, 10)}시`;
}

export function isFreshDaejeonCurrentWeatherCondition(
  condition: NonNullable<NonNullable<HomeWeatherApiPayload["currentWeather"]>["condition"]>,
  now = new Date()
) {
  if (!/대전/u.test(condition.area)) return false;
  const match = condition.observedAt.match(/^(\d{4})-(\d{2})-(\d{2}) \d{2}시$/u);
  if (!match) return false;
  return `${match[1]}${match[2]}${match[3]}` === formatKoreanDate(now);
}

function isDaejeonWeatherItem(item: HomeWeatherItem) {
  const text = [item.totalCityName, item.doName, item.cityName, item.cityAreaId]
    .filter(Boolean)
    .join(" ");
  return /대전/u.test(text);
}

function getLiteralGradeAdvice(grade: string | null | undefined) {
  const normalized = grade?.replace(/\s+/g, "") ?? "";
  if (normalized === "매우좋음" || normalized === "좋음") {
    return "공식 안내: 야외활동에 적합해요.";
  }
  if (normalized === "보통") {
    return "공식 안내: 선택적으로 야외활동하되 주의가 필요해요.";
  }
  if (normalized === "나쁨") {
    return "공식 안내: 야외활동에는 적합하지 않아요. 실내 일정을 우선 검토하세요.";
  }
  if (normalized === "특보발령주의") {
    return "공식 안내: 기상 특보에 유의하세요. 공식 예보와 안전 안내를 먼저 확인하세요.";
  }
  return null;
}

function formatCurrentWeatherSummary(
  condition: NonNullable<HomeWeatherApiPayload["currentWeather"]>["condition"]
) {
  if (!condition) return null;

  const details = [
    condition.temperatureC !== null ? `${condition.temperatureC.toFixed(1)}℃` : null,
    condition.humidityPercent !== null ? `습도 ${condition.humidityPercent}%` : null,
    condition.windSpeedMs !== null ? `바람 ${condition.windSpeedMs.toFixed(1)}m/s` : null
  ].filter(Boolean);

  return details.length ? details.join(" · ") : null;
}

function formatPrecipitationLabel(
  precipitation: NonNullable<
    NonNullable<HomeWeatherApiPayload["currentWeather"]>["condition"]
  >["precipitation"],
  rainfallMm: number | null
) {
  const label =
    precipitation === "none"
      ? "강수 없음"
      : precipitation === "rain"
        ? "비"
        : precipitation === "rain_snow"
          ? "비 또는 눈"
          : precipitation === "snow"
            ? "눈"
            : precipitation === "shower"
              ? "소나기"
              : "강수 형태 미확인";

  return rainfallMm !== null && rainfallMm > 0 ? `${label} · 1시간 강수 ${rainfallMm}mm` : label;
}

function buildCurrentWeatherAdvice(
  condition: NonNullable<HomeWeatherApiPayload["currentWeather"]>["condition"],
  tourismClimateGrade: string | null | undefined
) {
  if (!condition) return getLiteralGradeAdvice(tourismClimateGrade);

  if (condition.precipitation !== "none" && condition.precipitation !== "unknown") {
    return "현재 강수가 있어요. 미끄럼이 적은 실내 관광지와 짧은 보행 동선을 우선 검토하세요.";
  }

  if (condition.precipitation === "unknown") {
    return "현재 강수 형태를 확인하지 못했어요. 공식 예보를 함께 확인하고 실내 대체 코스를 준비하세요.";
  }

  if (condition.temperatureC !== null && condition.temperatureC >= 30) {
    return "현재 기온이 높아요. 그늘, 냉방 휴식 지점, 짧은 야외 이동을 우선으로 코스를 잡으세요.";
  }

  if (condition.temperatureC !== null && condition.temperatureC <= 0) {
    return "현재 기온이 낮아요. 실내 휴식 시간을 넉넉히 잡고 결빙 위험이 있는 길은 피하세요.";
  }

  if (condition.windSpeedMs !== null && condition.windSpeedMs >= 8) {
    return "현재 바람이 강한 편이에요. 야외 전망대나 긴 노출 동선보다 실내·저지대 코스를 먼저 보세요.";
  }

  return (
    getLiteralGradeAdvice(tourismClimateGrade) ||
    "현재 날씨는 큰 강수 신호가 없어요. 계절 주의사항을 함께 보고 코스를 선택하세요."
  );
}

function formatKoreanDate(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Seoul",
    year: "numeric"
  });
  return formatter.format(date).replaceAll("-", "");
}
