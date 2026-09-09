type SelectDiverseItemsOptions<T> = {
  items: readonly T[];
  getTitle: (item: T) => string;
  limit: number;
  seenTitles?: readonly string[];
};

function normalizeTitle(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g, "").trim();
}

export function asksForSingleRecommendation(message: string) {
  const compactMessage = message
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .replace(/[\s!?.,'"]/g, "");

  return [
    "어디인가요",
    "어디예요",
    "어디야",
    "어느곳",
    "한곳만",
    "한군데",
    "하나만",
    "하나추천",
    "제일",
    "가장",
    "딱하나"
  ].some((pattern) => compactMessage.includes(pattern));
}

export function resolveRequestedRecommendationLimit(
  message: string,
  options: { defaultLimit?: number; maxLimit?: number } = {}
) {
  const defaultLimit = Math.max(1, options.defaultLimit ?? 2);
  const maxLimit = Math.max(1, options.maxLimit ?? 5);
  const compactMessage = message.normalize("NFKC").toLocaleLowerCase("ko-KR");
  const numericMatch = compactMessage.match(/(\d+)\s*(?:개|곳|군데|명소|장소)/u);
  const wordLimit = resolveKoreanCount(compactMessage);
  const requestedLimit = numericMatch ? Number.parseInt(numericMatch[1], 10) : wordLimit;
  const fallbackLimit = asksForSingleRecommendation(message) ? 1 : defaultLimit;
  const limit = Number.isFinite(requestedLimit) && requestedLimit ? requestedLimit : fallbackLimit;

  return Math.min(Math.max(1, limit), maxLimit);
}

export function selectDiverseItems<T>({
  items,
  getTitle,
  limit,
  seenTitles = []
}: SelectDiverseItemsOptions<T>) {
  if (limit <= 0) return [];

  const normalizedSeenTitles = new Set(seenTitles.map(normalizeTitle).filter(Boolean));
  const usedTitles = new Set<string>();
  const unseenItems: T[] = [];
  const seenItems: T[] = [];

  items.forEach((item, index) => {
    const normalizedTitle = normalizeTitle(getTitle(item));
    const identity = normalizedTitle || `__untitled_${index}`;
    if (usedTitles.has(identity)) return;
    usedTitles.add(identity);

    if (normalizedTitle && normalizedSeenTitles.has(normalizedTitle)) {
      seenItems.push(item);
    } else {
      unseenItems.push(item);
    }
  });

  return [...unseenItems, ...seenItems].slice(0, limit);
}

function resolveKoreanCount(message: string) {
  const compactMessage = message.replace(/\s+/g, "");
  const countWords: Array<[RegExp, number]> = [
    [/(?:하나|한)(?:개|곳|군데|장소|명소|만)/u, 1],
    [/(?:둘|두)(?:개|곳|군데|장소|명소)/u, 2],
    [/(?:셋|세)(?:개|곳|군데|장소|명소)/u, 3],
    [/(?:넷|네)(?:개|곳|군데|장소|명소)/u, 4],
    [/(?:다섯|오)(?:개|곳|군데|장소|명소)/u, 5]
  ];

  return countWords.find(([pattern]) => pattern.test(compactMessage))?.[1] ?? null;
}
