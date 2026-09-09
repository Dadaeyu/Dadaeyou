import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBakeryPlaceIds, BAKERY_THEME_CODE } from "@/lib/theme/bakeryTheme";
import { getBarrierFreeIds } from "@/lib/search/placeFilters";
import { BARRIERFREE_CODE_GROUP, THEME_CODE_GROUP } from "@/lib/supabase/codes";
import { buildPlaceReviewRankings, groupPlaceFavoriteSignals } from "./discoveryPlaceData";

export const dynamic = "force-dynamic";

const LEGACY_RESULT_COUNT = 5;
// 로그인 + 접근성/선호테마 매칭 추천 기능 — 보류 중. 다시 켜려면 true로 바꾸면 됨
// (아래 로직/프론트 배지·마커 표시는 그대로 남겨뒀고, 이 플래그 하나로 켜고 끈다).
const PERSONALIZED_RECOMMENDATIONS_ENABLED = false;
// 로그인 + 접근성/선호테마가 저장돼 있을 때 보여줄 "추천 장소" 개수.
const RECOMMENDED_RESULT_COUNT = 10;
const HOME_SECTION_COUNT = 4;
// 순위 산정은 "후기" 게시판(board_id 1)의 별점 평균만 사용.
const REVIEW_BOARD_ID = 1;

type PlaceResult = {
  id: string;
  placeId: number;
  name: string;
  lat: number;
  lng: number;
  image: string;
  address?: string;
  categoryCode?: string;
  average_rating: number | null;
  review_count: number;
  like_count: number;
  // 로그인 사용자의 저장된 접근성 니즈/선호 테마와 매칭될 때만 true (비로그인/미매칭 시 필드 자체가 응답에서 빠진다).
  matchedAccessibility?: boolean;
  matchedTheme?: boolean;
};

export async function GET() {
  try {
    const supabase = await createClient();

    const [reviewResult, favoriteResult, userResult] = await Promise.all([
      supabase
        .from("tb_post")
        .select("content_id, rating")
        .eq("board_id", REVIEW_BOARD_ID)
        .eq("use_yn", true)
        .not("rating", "is", null)
        .not("content_id", "is", null),
      supabase.from("tb_place_like").select("place_id"),
      supabase.auth.getUser()
    ]);

    if (reviewResult.error) throw reviewResult.error;
    if (favoriteResult.error) throw favoriteResult.error;

    const reviewRankings = buildPlaceReviewRankings(
      reviewResult.data ?? [],
      HOME_SECTION_COUNT,
      LEGACY_RESULT_COUNT
    );
    const grouped = reviewRankings.grouped;
    const likeCounts = groupPlaceFavoriteSignals(favoriteResult.data ?? []);

    const rankedFavorites = Array.from(likeCounts.entries())
      .map(([contentId, count]) => ({ contentId, count }))
      .sort((a, b) => b.count - a.count || a.contentId.localeCompare(b.contentId))
      .slice(0, HOME_SECTION_COUNT);

    const hotContentIds = reviewRankings.legacy.map((item) => item.contentId);
    const hotIdSet = new Set(hotContentIds);

    // 로그인 사용자의 저장된 접근성 니즈/선호 테마로 추가 후보를 찾는다. 비로그인이거나
    // 저장된 값이 없으면 기존과 동일하게 핫플레이스만 보여준다.
    const user = userResult.data.user;
    let accessibilityContentIds: string[] = [];
    let themeContentIds: string[] = [];

    if (PERSONALIZED_RECOMMENDATIONS_ENABLED && user) {
      const { data: prefs } = await supabase
        .from("tb_user_preferences")
        .select("accessibility_needs, theme_preferences")
        .eq("user_id", user.id)
        .maybeSingle();

      const accessibilityNeeds = prefs?.accessibility_needs ?? [];
      const themePreferences = prefs?.theme_preferences ?? [];

      if (accessibilityNeeds.length > 0 || themePreferences.length > 0) {
        const admin = createAdminClient();

        if (accessibilityNeeds.length > 0) {
          // tb_user_preferences.accessibility_needs 에는 code_nm(라벨)이 저장돼 있어,
          // getBarrierFreeIds가 기대하는 code_id로 먼저 변환해야 한다.
          const { data: codes } = await admin
            .from("tb_code")
            .select("code_id")
            .eq("code_group", BARRIERFREE_CODE_GROUP)
            .in("code_nm", accessibilityNeeds);
          const codeIds = (codes ?? []).map((c) => c.code_id as string);
          if (codeIds.length > 0) {
            accessibilityContentIds = await getBarrierFreeIds(codeIds);
          }
        }

        if (themePreferences.length > 0) {
          // theme_preferences도 code_nm(라벨) 저장 — CONTENTTYPE 그룹에서 실제
          // tb_place.contenttypeid 값(code_id)으로 변환해 매칭한다.
          const { data: codes } = await admin
            .from("tb_code")
            .select("code_id")
            .eq("code_group", THEME_CODE_GROUP)
            .in("code_nm", themePreferences);
          const contentTypeIds = (codes ?? []).map((c) => c.code_id as string);
          if (contentTypeIds.length > 0) {
            const { data: themedPlaces } = await supabase
              .from("tb_place")
              .select("contentid")
              .or("delete_yn.is.null,delete_yn.eq.N")
              .eq("use_yn", "Y")
              .not("mapx", "is", null)
              .not("mapy", "is", null)
              .in("contenttypeid", contentTypeIds);
            themeContentIds = (themedPlaces ?? []).map((p) => String(p.contentid));
          }
        }
      }
    }

    const accessibilityIdSet = new Set(accessibilityContentIds);
    const themeIdSet = new Set(themeContentIds);
    const hasPersonalization = accessibilityIdSet.size > 0 || themeIdSet.size > 0;

    const candidateIds = [
      ...new Set([
        ...hotContentIds,
        ...rankedFavorites.map((item) => item.contentId),
        ...accessibilityContentIds,
        ...themeContentIds
      ])
    ];

    const placeByContentId = new Map<
      string,
      {
        place_id: number;
        contentid: string | number;
        title: string;
        addr1: string | null;
        mapx: number | string;
        mapy: number | string;
        firstimage: string | null;
        lclssystm1: string | null;
      }
    >();

    if (candidateIds.length > 0) {
      const { data: places, error: placesError } = await supabase
        .from("tb_place")
        .select("place_id, contentid, title, addr1, mapx, mapy, firstimage, lclssystm1")
        .or("delete_yn.is.null,delete_yn.eq.N")
        .eq("use_yn", "Y")
        .in("contentid", candidateIds)
        .not("mapx", "is", null)
        .not("mapy", "is", null);

      if (placesError) throw placesError;

      // content_id와 contentid는 bigint라 문자열 기준으로 맞춘다.
      for (const place of places ?? []) placeByContentId.set(String(place.contentid), place);
    }

    const bakeryIds = await getBakeryPlaceIds();
    const bakerySet = new Set(bakeryIds);

    const toPlaceResult = (contentId: string): PlaceResult | null => {
      const place = placeByContentId.get(contentId);
      if (!place) return null;
      const rating = grouped.get(contentId);
      return {
        id: String(place.contentid),
        placeId: place.place_id,
        name: place.title,
        lat: Number(place.mapy),
        lng: Number(place.mapx),
        image: place.firstimage ?? "",
        address: place.addr1 ?? undefined,
        categoryCode: bakerySet.has(place.place_id)
          ? BAKERY_THEME_CODE
          : (place.lclssystm1 ?? undefined),
        average_rating: rating ? rating.sum / rating.count : null,
        review_count: rating?.count ?? 0,
        like_count: likeCounts.get(contentId) ?? 0,
        matchedAccessibility: accessibilityIdSet.has(contentId) || undefined,
        matchedTheme: themeIdSet.has(contentId) || undefined
      };
    };

    const isPlaceResult = (place: PlaceResult | null): place is PlaceResult => place !== null;

    const reviewPlaces = reviewRankings.home
      .map((item) => toPlaceResult(item.contentId))
      .filter(isPlaceResult);
    const favoritePlaces = rankedFavorites
      .map((item) => toPlaceResult(item.contentId))
      .filter(isPlaceResult);

    let places: PlaceResult[];

    if (!hasPersonalization) {
      places = hotContentIds.map(toPlaceResult).filter(isPlaceResult);
    } else {
      const allIds = new Set([...hotIdSet, ...accessibilityIdSet, ...themeIdSet]);
      places = Array.from(allIds)
        .map(toPlaceResult)
        .filter(isPlaceResult)
        .map((place) => ({
          place,
          score:
            (hotIdSet.has(place.id) ? 1 : 0) +
            (place.matchedAccessibility ? 1 : 0) +
            (place.matchedTheme ? 1 : 0)
        }))
        .sort(
          (a, b) =>
            b.score - a.score ||
            (b.place.average_rating ?? -1) - (a.place.average_rating ?? -1) ||
            b.place.review_count - a.place.review_count ||
            b.place.like_count - a.place.like_count
        )
        .slice(0, RECOMMENDED_RESULT_COUNT)
        .map((entry) => entry.place);
    }

    return NextResponse.json({ places, reviewPlaces, favoritePlaces });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch top rated places" },
      { status: 500 }
    );
  }
}
