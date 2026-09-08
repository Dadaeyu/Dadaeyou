export type CurrentWeatherStatus = "not_configured" | "ready" | "empty" | "unavailable";

export type CurrentWeatherCondition = {
  area: string;
  humidityPercent: number | null;
  observedAt: string;
  precipitation: "none" | "rain" | "rain_snow" | "snow" | "shower" | "unknown";
  rainfallMm: number | null;
  source: string;
  temperatureC: number | null;
  windSpeedMs: number | null;
};

export type CurrentWeatherDebug = {
  condition: CurrentWeatherCondition | null;
  request?: {
    baseDate: string;
    baseTime: string;
    endpoint: string;
    nx: string;
    ny: string;
  };
  source: string;
  status: CurrentWeatherStatus;
  statusMessage: string;
};

export type CurrentWeatherResult = {
  condition: CurrentWeatherCondition | null;
  debug: CurrentWeatherDebug;
  message: string;
  source: string;
  status: CurrentWeatherStatus;
};

export type CurrentWeatherRuntime = {
  createTimeoutSignal?: (timeoutMs: number) => AbortSignal;
  fetch?: CurrentWeatherFetch;
  now?: () => Date;
  timeoutMs?: number;
};

type CurrentWeatherFetch = (
  input: string,
  init: {
    headers: { Accept: string };
    next: { revalidate: number };
    signal: AbortSignal;
  }
) => Promise<Response>;

type CurrentWeatherItem = {
  baseDate: string | null;
  baseTime: string | null;
  category: string | null;
  nx: string | null;
  ny: string | null;
  obsrValue: string | null;
};

export const KMA_CURRENT_WEATHER_URL =
  "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst";
export const KMA_CURRENT_WEATHER_SOURCE = "기상청 단기예보 조회서비스 초단기실황";
export const KMA_CURRENT_WEATHER_TIMEOUT_MS = 8_000;
export const DAEJEON_WEATHER_GRID = { nx: "67", ny: "100" };

export async function fetchCurrentWeather(
  runtime: CurrentWeatherRuntime = {}
): Promise<CurrentWeatherResult> {
  const config = getCurrentWeatherConfig();

  if (!config.enabled || !config.apiKey) {
    return createCurrentWeatherResult({
      message: config.enabled ? "기상청 현재 날씨 API 키 미설정" : "기상청 현재 날씨 조회 비활성화",
      status: "not_configured"
    });
  }

  const base = getUltraShortNowcastBaseTime(runtime.now?.() ?? new Date());
  const request = {
    baseDate: base.baseDate,
    baseTime: base.baseTime,
    endpoint: KMA_CURRENT_WEATHER_URL,
    nx: config.nx,
    ny: config.ny
  };
  const params = new URLSearchParams({
    base_date: request.baseDate,
    base_time: request.baseTime,
    dataType: "JSON",
    numOfRows: "100",
    nx: request.nx,
    ny: request.ny,
    pageNo: "1"
  });
  const url = `${KMA_CURRENT_WEATHER_URL}?${params.toString()}&serviceKey=${encodePublicDataServiceKey(
    config.apiKey
  )}`;
  const fetchImpl = runtime.fetch ?? fetch;
  const createTimeoutSignal = runtime.createTimeoutSignal ?? createAbortTimeoutSignal;

  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 600 },
      signal: createTimeoutSignal(runtime.timeoutMs ?? KMA_CURRENT_WEATHER_TIMEOUT_MS)
    });

    if (!response.ok) {
      return createCurrentWeatherResult({
        message: getCurrentWeatherHttpFailureMessage(response.status),
        request,
        status: "unavailable"
      });
    }

    const data = (await response.json()) as unknown;
    const apiError = getPublicDataApiError(data);
    if (apiError) {
      return createCurrentWeatherResult({
        message: apiError,
        request,
        status: "unavailable"
      });
    }

    const items = extractPublicDataItems(data).map(normalizeCurrentWeatherItem);
    const condition = buildCurrentWeatherCondition(items, request);

    if (!condition) {
      return createCurrentWeatherResult({
        message: "대전 현재 날씨 데이터 없음",
        request,
        status: "empty"
      });
    }

    return createCurrentWeatherResult({
      condition,
      message: "대전 현재 날씨 실황 사용",
      request,
      status: "ready"
    });
  } catch {
    return createCurrentWeatherResult({
      message: "기상청 현재 날씨 API 연결 실패",
      request,
      status: "unavailable"
    });
  }
}

export function getUltraShortNowcastBaseTime(date: Date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  if (kst.getUTCMinutes() < 45) {
    kst.setUTCHours(kst.getUTCHours() - 1);
  }

  return {
    baseDate: [
      kst.getUTCFullYear(),
      String(kst.getUTCMonth() + 1).padStart(2, "0"),
      String(kst.getUTCDate()).padStart(2, "0")
    ].join(""),
    baseTime: `${String(kst.getUTCHours()).padStart(2, "0")}00`
  };
}

function getCurrentWeatherConfig() {
  return {
    apiKey: (
      process.env.KMA_CURRENT_WEATHER_SERVICE_KEY ||
      process.env.KMA_TOUR_WEATHER_SERVICE_KEY ||
      process.env.TOUR_WEATHER_SERVICE_KEY ||
      process.env.TOUR_API_SERVICE_KEY ||
      ""
    ).trim(),
    enabled: process.env.KMA_CURRENT_WEATHER_ENABLED !== "false",
    nx: (process.env.KMA_CURRENT_WEATHER_NX || DAEJEON_WEATHER_GRID.nx).trim(),
    ny: (process.env.KMA_CURRENT_WEATHER_NY || DAEJEON_WEATHER_GRID.ny).trim()
  };
}

function createCurrentWeatherResult({
  condition = null,
  message,
  request,
  status
}: {
  condition?: CurrentWeatherCondition | null;
  message: string;
  request?: CurrentWeatherDebug["request"];
  status: CurrentWeatherStatus;
}): CurrentWeatherResult {
  return {
    condition,
    debug: {
      condition,
      request,
      source: KMA_CURRENT_WEATHER_SOURCE,
      status,
      statusMessage: message
    },
    message,
    source: KMA_CURRENT_WEATHER_SOURCE,
    status
  };
}

function buildCurrentWeatherCondition(
  items: CurrentWeatherItem[],
  request: CurrentWeatherDebug["request"]
) {
  const matchingItems = items.filter(
    (item) =>
      item.baseDate === request?.baseDate &&
      item.baseTime === request?.baseTime &&
      item.nx === request?.nx &&
      item.ny === request?.ny
  );
  const values = new Map(
    matchingItems
      .filter((item) => item.category && item.obsrValue !== null)
      .map((item) => [item.category as string, item.obsrValue as string])
  );

  if (!values.size) return null;
  const precipitation = parsePrecipitation(values.get("PTY"));
  const condition = {
    area: "대전광역시",
    humidityPercent: parseFiniteNumber(values.get("REH")),
    observedAt: formatObservedAt(
      matchingItems[0]?.baseDate ?? null,
      matchingItems[0]?.baseTime ?? null
    ),
    precipitation,
    rainfallMm: parseRainfall(values.get("RN1")),
    source: KMA_CURRENT_WEATHER_SOURCE,
    temperatureC: parseFiniteNumber(values.get("T1H")),
    windSpeedMs: parseFiniteNumber(values.get("WSD"))
  };

  if (!hasUsableCurrentWeatherMetric(condition)) return null;

  return condition;
}

function hasUsableCurrentWeatherMetric(condition: CurrentWeatherCondition) {
  return (
    condition.temperatureC !== null ||
    condition.humidityPercent !== null ||
    condition.windSpeedMs !== null ||
    condition.rainfallMm !== null ||
    condition.precipitation !== "unknown"
  );
}

function parsePrecipitation(value: string | undefined): CurrentWeatherCondition["precipitation"] {
  switch (value) {
    case "0":
      return "none";
    case "1":
      return "rain";
    case "2":
      return "rain_snow";
    case "3":
      return "snow";
    case "5":
    case "6":
      return "rain";
    case "7":
      return "snow";
    case "4":
      return "shower";
    default:
      return "unknown";
  }
}

function parseRainfall(value: string | undefined) {
  if (!value) return null;
  if (value === "강수없음" || value === "0") return 0;
  const match = value.match(/\d+(?:\.\d+)?/u);
  return match ? Number(match[0]) : null;
}

function parseFiniteNumber(value: string | undefined) {
  if (value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatObservedAt(
  baseDate: string | null | undefined,
  baseTime: string | null | undefined
) {
  if (!baseDate || !baseTime || !/^\d{8}$/.test(baseDate) || !/^\d{4}$/.test(baseTime)) {
    return "관측 시각 미확인";
  }

  return `${baseDate.slice(0, 4)}-${baseDate.slice(4, 6)}-${baseDate.slice(6, 8)} ${baseTime.slice(
    0,
    2
  )}시`;
}

function getCurrentWeatherHttpFailureMessage(status: number) {
  if (status === 401 || status === 403) {
    return `기상청 현재 날씨 API 권한 확인 필요(${status})`;
  }

  return `기상청 현재 날씨 API 호출 실패(${status})`;
}

function createAbortTimeoutSignal(timeoutMs: number) {
  return AbortSignal.timeout(timeoutMs);
}

function encodePublicDataServiceKey(serviceKey: string) {
  return serviceKey.includes("%") ? serviceKey : encodeURIComponent(serviceKey);
}

function getPublicDataApiError(value: unknown) {
  const root = asRecord(value);
  const response = asRecord(root?.response);
  const header = asRecord(response?.header);
  const resultCode = readTextField(header, ["resultCode"]);

  if (!resultCode || resultCode === "00" || resultCode === "0000") return null;

  const resultMsg = readTextField(header, ["resultMsg", "resultMessage"]) || "오류 메시지 없음";
  return `기상청 현재 날씨 API 오류: ${resultMsg}`;
}

function extractPublicDataItems(value: unknown) {
  const root = asRecord(value);
  const response = asRecord(root?.response);
  const body = asRecord(response?.body);
  const items = asRecord(body?.items);
  const rawItem = items?.item;

  if (Array.isArray(rawItem)) return rawItem;
  if (rawItem) return [rawItem];
  return [];
}

function normalizeCurrentWeatherItem(value: unknown): CurrentWeatherItem {
  const record = asRecord(value);

  return {
    baseDate: readTextField(record, ["baseDate", "BASE_DATE"]),
    baseTime: readTextField(record, ["baseTime", "BASE_TIME"]),
    category: readTextField(record, ["category", "CATEGORY"]),
    nx: readTextField(record, ["nx", "NX"]),
    ny: readTextField(record, ["ny", "NY"]),
    obsrValue: readTextField(record, ["obsrValue", "OBSR_VALUE"])
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readTextField(record: Record<string, unknown> | null, keys: string[]) {
  if (!record) return null;

  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }

  return null;
}
