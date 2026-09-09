export type BakeryPlaceKnowledgeSource = {
  contentid: string | number;
  title: string;
  addr1: string | null;
  mapx: string | number | null;
  mapy: string | number | null;
};

export type BakeryDetailKnowledgeSource = {
  contentid: string | number;
  overview: string | null;
  tel: string | null;
  usetime: string | null;
  restdate: string | null;
  usefee: string | null;
  parking: string | null;
};

export type BakeryAccessibilityKnowledgeSource = {
  contentid: string | number;
  parking: string | null;
  route: string | null;
  publictransport: string | null;
  wheelchair: string | null;
  exit: string | null;
  elevator: string | null;
  restroom: string | null;
  stroller: string | null;
  lactationroom: string | null;
};

export type BakeryKnowledgeRow = {
  title: string;
  category: "음식점";
  source: "다대유 장소 정보";
  content: string;
  metadata: {
    contentid: string;
    address: string;
    tel: string;
    latitude: string;
    longitude: string;
    summary: string;
    operating_time: string;
    fee: string;
    parking_facility: string;
    accessibility: Record<string, string>;
    source_type: "bakery_place";
  };
};

export function mapBakeryKnowledgeRows(
  places: BakeryPlaceKnowledgeSource[],
  details: BakeryDetailKnowledgeSource[] = [],
  accessibilityRows: BakeryAccessibilityKnowledgeSource[] = []
): BakeryKnowledgeRow[] {
  const detailsByContentId = new Map(details.map((row) => [String(row.contentid), row]));
  const accessibilityByContentId = new Map(
    accessibilityRows.map((row) => [String(row.contentid), row])
  );

  return places.flatMap((place) => {
    const title = cleanText(place.title);
    if (!title) return [];

    const contentId = String(place.contentid);
    const detail = detailsByContentId.get(contentId);
    const accessibility = accessibilityByContentId.get(contentId);
    const summary = cleanText(detail?.overview);
    const address = cleanText(place.addr1);
    const operatingTime = cleanText(detail?.usetime);
    const restDate = cleanText(detail?.restdate);

    return [
      {
        title,
        category: "음식점" as const,
        source: "다대유 장소 정보" as const,
        content: [
          `${title}은(는) 다대유에 등록된 대전 빵집입니다.`,
          summary,
          address ? `주소: ${address}` : null,
          operatingTime ? `운영시간: ${operatingTime}` : null,
          restDate ? `휴무일: ${restDate}` : null
        ]
          .filter(Boolean)
          .join(" "),
        metadata: {
          contentid: contentId,
          address: address || "",
          tel: cleanText(detail?.tel) || "",
          latitude: coordinateText(place.mapy),
          longitude: coordinateText(place.mapx),
          summary: summary || "",
          operating_time: operatingTime || "",
          fee: cleanText(detail?.usefee) || "",
          parking_facility: cleanText(detail?.parking) || "",
          accessibility: buildAccessibility(accessibility),
          source_type: "bakery_place" as const
        }
      }
    ];
  });
}

function buildAccessibility(row: BakeryAccessibilityKnowledgeSource | undefined) {
  if (!row) return {};

  return Object.fromEntries(
    [
      ["parking", row.parking],
      ["route", row.route],
      ["publictransport", row.publictransport],
      ["wheelchair", row.wheelchair],
      ["exit", row.exit],
      ["elevator", row.elevator],
      ["restroom", row.restroom],
      ["stroller", row.stroller],
      ["lactationroom", row.lactationroom]
    ]
      .map(([key, value]) => [key, cleanText(value)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
  );
}

function cleanText(value: unknown) {
  if (typeof value !== "string") return "";
  return value
    .replace(/<br\s*\/?\s*>/giu, " ")
    .replace(/<[^>]+>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/\s+/gu, " ")
    .trim();
}

function coordinateText(value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : "";
}
