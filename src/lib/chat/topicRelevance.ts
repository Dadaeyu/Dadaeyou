export type ExplicitChatTheme = "bakery";

type ChatHistoryEntry = {
  role: "assistant" | "user";
  content: string;
};

type CategorizedRow = {
  category?: string | null;
};

type ContentIdRow = {
  contentid?: string | number | null;
  contentId?: string | number | null;
  metadata?: Record<string, unknown> | null;
};

const CATEGORY_ALIASES: Record<string, string[]> = {
  관광지: ["관광지", "여행지", "공원", "산책"],
  문화시설: ["문화시설", "박물관", "미술관", "도서관", "전시", "기념관"],
  음식점: ["음식점", "음식", "식당", "맛집", "카페", "빵", "빵집", "베이커리", "디저트", "성심당"],
  쇼핑: ["쇼핑", "시장", "백화점", "상점"],
  숙박: ["숙박", "호텔", "숙소", "펜션"],
  레포츠: ["레포츠", "운동", "체육", "캠핑"],
  공중화장실: ["공중화장실", "장애인 화장실", "장애인화장실"],
  장애인주차장: ["장애인주차장", "장애인 주차장", "장애인 주차"]
};

const BAKERY_ALIASES = ["빵지순례", "베이커리", "빵집", "제과점", "성심당", "빵"];

export function extractExplicitChatCategories(message: string) {
  const normalized = normalize(message);

  return Object.entries(CATEGORY_ALIASES)
    .filter(([, aliases]) => aliases.some((alias) => normalized.includes(normalize(alias))))
    .map(([category]) => category);
}

export function extractExplicitChatTheme(message: string): ExplicitChatTheme | null {
  const normalized = normalize(message);
  return BAKERY_ALIASES.some((alias) => normalized.includes(normalize(alias))) ? "bakery" : null;
}

export function resolveSessionChatCategories(message: string, history: ChatHistoryEntry[]) {
  const explicitCategories = extractExplicitChatCategories(message);
  if (explicitCategories.length) return explicitCategories;
  if (!isConstraintFollowUp(message)) return [];

  return findLatestUserValue(history, extractExplicitChatCategories, [] as string[]);
}

export function resolveSessionChatTheme(
  message: string,
  history: ChatHistoryEntry[]
): ExplicitChatTheme | null {
  const explicitTheme = extractExplicitChatTheme(message);
  if (explicitTheme) return explicitTheme;

  const explicitCategories = extractExplicitChatCategories(message);
  if (explicitCategories.length) return null;
  if (!isConstraintFollowUp(message)) return null;

  return findLatestUserValue(history, extractExplicitChatTheme, null);
}

export function filterRowsByExplicitCategories<T extends CategorizedRow>(
  rows: T[],
  categories: string[]
) {
  if (!categories.length) return rows;
  const allowed = new Set(categories);
  return rows.filter((row) => row.category && allowed.has(row.category));
}

export function filterRowsByAllowedContentIds<T extends ContentIdRow>(
  rows: T[],
  contentIds: string[]
) {
  if (!contentIds.length) return [];
  const allowed = new Set(contentIds.map(String));

  return rows.filter((row) => {
    const rawContentId =
      row.contentid ?? row.contentId ?? row.metadata?.contentid ?? row.metadata?.contentId;
    return rawContentId !== null && rawContentId !== undefined && allowed.has(String(rawContentId));
  });
}

function normalize(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/gu, " ").trim();
}

function isConstraintFollowUp(message: string) {
  const normalized = normalize(message);
  return /(그중|그 중|그곳|그 곳|거기|앞에서|방금|추천한|휠체어|유모차|장애인|주차|화장실|엘리베이터|실내|비 오|날씨|1박\s*2일|당일|코스|동선)/u.test(
    normalized
  );
}

function findLatestUserValue<T>(
  history: ChatHistoryEntry[],
  resolve: (content: string) => T,
  fallback: T
) {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];
    if (item.role !== "user") continue;
    const value = resolve(item.content);
    if (Array.isArray(value) ? value.length > 0 : Boolean(value)) return value;
  }

  return fallback;
}
