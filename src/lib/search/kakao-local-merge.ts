export type KakaoLocalDocument = {
  id?: string;
  place_name?: string;
  y?: string;
  x?: string;
  road_address_name?: string;
  address_name?: string;
  phone?: string;
  category_name?: string;
  place_url?: string;
  road_address?: { address_name?: string; building_name?: string };
  address?: { address_name?: string };
};

export function addressDocumentToKeyword(doc: KakaoLocalDocument): KakaoLocalDocument {
  const road = doc.road_address?.address_name ?? doc.road_address_name ?? "";
  const jibun = doc.address?.address_name ?? doc.address_name ?? "";
  const building = doc.road_address?.building_name?.trim() ?? "";
  const name = building || road || jibun || "주소";
  return {
    id: doc.id || `addr_${doc.x ?? ""}_${doc.y ?? ""}`,
    place_name: name,
    y: doc.y,
    x: doc.x,
    road_address_name: road,
    address_name: jibun,
    phone: "",
    category_name: "주소",
    place_url: ""
  };
}

export function mergeKakaoLocalDocuments(
  keywordDocs: KakaoLocalDocument[],
  addressDocs: KakaoLocalDocument[],
  limit = 15
): KakaoLocalDocument[] {
  const seen = new Set<string>();
  const out: KakaoLocalDocument[] = [];

  const push = (doc: KakaoLocalDocument) => {
    if (!doc.x || !doc.y) return;
    const key = `${doc.x},${doc.y}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(doc);
  };

  for (const doc of keywordDocs) push(doc);
  for (const doc of addressDocs) push(addressDocumentToKeyword(doc));
  return out.slice(0, limit);
}
