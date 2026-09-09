// 카카오 로컬 검색 API(/api/kakao-search)를 호출해 DB 검색 결과와 같은 SearchPlace 형태로 변환한다.

export interface SearchPlace {
  id: string; // tb_place.contentid (문자열) — 카카오 출처는 "kakao_..." 형태
  name: string;
  lat: number;
  lng: number;
  image: string;
  source?: "db" | "kakao";
  address?: string;
  phone?: string;
  category?: string;
  placeUrl?: string;
  // tb_place.lclssystm1 (대분류 코드, 예: "FD"/"NA") — DB 출처(source="db")일 때만 채워짐.
  // 지도 마커를 카테고리별 색으로 칠하는 데 쓴다.
  categoryCode?: string;
  // "후기" 게시판 별점 평균 (DB 출처일 때만 채워짐)
  average_rating?: number | null;
  review_count?: number;
  // tb_place_like에 저장된 즐겨찾기(찜) 수 — DB 출처일 때만 채워짐.
  like_count?: number;
  // tb_place.place_id (내부 PK) — DB 출처(source="db")일 때만 채워짐.
  // tb_course_detail.place_id 등 place_id 를 FK로 쓰는 곳은 반드시 이 값을 써야 한다(contentid 아님).
  placeId?: number;
}

export async function fetchKakaoPlaces(
  keyword: string,
  gu?: string,
  dong?: string,
  options?: { originSearch?: boolean }
): Promise<SearchPlace[]> {
  try {
    const params = new URLSearchParams({ query: keyword });
    if (gu) params.set("gu", gu);
    if (dong) params.set("dong", dong);
    if (options?.originSearch) params.set("scope", "origin");
    const res = await fetch(`/api/kakao-search?${params}`);
    if (!res.ok) return [];
    const { documents } = await res.json();
    return (documents ?? []).map(
      (p: {
        id: string;
        place_name: string;
        y: string;
        x: string;
        road_address_name: string;
        address_name: string;
        phone: string;
        category_name: string;
        place_url: string;
      }) => ({
        id: `kakao_${p.id}`,
        name: p.place_name,
        lat: Number(p.y),
        lng: Number(p.x),
        image: "",
        source: "kakao" as const,
        address: p.road_address_name || p.address_name,
        phone: p.phone || undefined,
        category: p.category_name,
        placeUrl: p.place_url || undefined
      })
    );
  } catch {
    return [];
  }
}
