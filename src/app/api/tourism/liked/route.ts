import { createClient } from "@/lib/supabase/server";
import { supabase as anonClient } from "@/lib/supabase";
import { T } from "@/lib/supabase/tables";
import { getRatingsByContentId, getLikeCountsByContentId } from "@/lib/search/placeAggregates";
import { getBakeryPlaceIds, splitThemeSelection, BAKERY_THEME_CODE } from "@/lib/theme/bakeryTheme";
import {
  getBarrierFreeIds,
  getRatedContentIds,
  getHeadcountExcludeIds,
  getScheduleExcludeIds
} from "@/lib/search/placeFilters";

// 로그인한 사용자가 tb_place_like에 저장한 장소들을 tb_place와 조인해 반환한다.
// 필터 패널의 "즐겨찾기" 토글용. /api/search 와 같은 구/동/테마/접근성/별점/인원/일정
// 쿼리 파라미터를 받으면 "즐겨찾기 중 조건에 맞는 것만"으로 좁혀서 반환한다(파라미터가
// 없으면 기존과 동일하게 즐겨찾기 전체를 반환).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const accessTypes = (searchParams.get("accessibility") ?? "").split(",").filter(Boolean);
  const guCode = searchParams.get("gu") ?? "";
  const dong = searchParams.get("dong") ?? "";
  const themes = (searchParams.get("themes") ?? "").split(",").filter(Boolean);
  const minRating = Number(searchParams.get("minRating") ?? "0");
  const headcount = Number(searchParams.get("headcount") ?? "0");
  const dateFrom = searchParams.get("dateFrom") ?? "";
  const dateTo = searchParams.get("dateTo") ?? "";

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return Response.json([]);

  const { data: likes, error: likesError } = await supabase
    .from(T.placeLikes)
    .select("place_id")
    .eq("user_id", user.id);

  if (likesError) return Response.json({ error: likesError.message }, { status: 500 });

  const placeIds = (likes ?? []).map((l) => l.place_id as number);
  if (placeIds.length === 0) return Response.json([]);

  let query = anonClient
    .from("tb_place")
    .select("place_id, contentid, title, addr1, mapx, mapy, firstimage, lclssystm1")
    .or("delete_yn.is.null,delete_yn.eq.N")
    .in("contentid", placeIds);

  if (guCode.trim()) query = query.eq("ldongsigngucd", guCode);
  if (dong.trim()) query = query.eq("dong", dong.trim());

  // 검색 경로와 무관하게 빵집 판정 결과를 마커 색에 쓰므로, 테마 필터에서 이미 조회했으면
  // 재사용하고 아니면 응답을 만들 때 한 번만 조회한다.
  let bakeryIds: number[] | null = null;

  try {
    // 테마(대분류) — /api/search 와 동일한 로직. 즐겨찾기 목록 안에서만 더 좁힌다.
    if (themes.length > 0) {
      const { officialCodes, includeBakery } = splitThemeSelection(themes);
      if (includeBakery) bakeryIds = await getBakeryPlaceIds();
      const activeBakeryIds = bakeryIds ?? [];
      if (officialCodes.length > 0 && includeBakery) {
        query = query.or(
          `lclssystm1.in.(${officialCodes.join(",")}),place_id.in.(${activeBakeryIds.length ? activeBakeryIds.join(",") : "-1"})`
        );
      } else if (officialCodes.length > 0) {
        query = query.in("lclssystm1", officialCodes);
      } else {
        query = query.in("place_id", activeBakeryIds.length > 0 ? activeBakeryIds : [-1]);
      }
    }

    if (accessTypes.length > 0) {
      const accessIds = await getBarrierFreeIds(accessTypes);
      query = query.in("contentid", accessIds.length > 0 ? accessIds : [-1]);
    }
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "접근성 정보를 조회하지 못했습니다." },
      { status: 500 }
    );
  }

  if (minRating > 0) {
    const ratedIds = await getRatedContentIds(minRating);
    query = query.in("contentid", ratedIds.length > 0 ? ratedIds : [-1]);
  }

  const excludeIds = new Set<string>();
  for (const id of await getHeadcountExcludeIds(headcount)) excludeIds.add(id);
  for (const id of await getScheduleExcludeIds(dateFrom, dateTo)) excludeIds.add(id);
  const finalQuery =
    excludeIds.size > 0 ? query.not("contentid", "in", `(${[...excludeIds].join(",")})`) : query;

  const { data, error } = await finalQuery;

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const ids = (data ?? []).map((p) => String(p.contentid));
  const [ratings, likeCounts] = await Promise.all([
    getRatingsByContentId(anonClient, ids),
    getLikeCountsByContentId(anonClient, ids)
  ]);
  bakeryIds ??= await getBakeryPlaceIds();
  const bakerySet = new Set(bakeryIds);

  return Response.json(
    (data ?? []).map((p) => {
      const cid = String(p.contentid);
      const rating = ratings.get(cid);
      return {
        id: cid,
        placeId: p.place_id,
        name: p.title,
        lat: Number(p.mapy),
        lng: Number(p.mapx),
        image: p.firstimage ?? "",
        address: p.addr1 ?? undefined,
        categoryCode: bakerySet.has(p.place_id) ? BAKERY_THEME_CODE : (p.lclssystm1 ?? undefined),
        average_rating: rating?.average ?? null,
        review_count: rating?.count ?? 0,
        like_count: likeCounts.get(cid) ?? 0
      };
    })
  );
}
