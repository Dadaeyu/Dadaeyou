import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BAKERY_THEME_CODE } from "@/lib/theme/bakeryTheme";
import { createPublicClient } from "@/lib/supabase/public";
import { buildPlaceReviewRankings, groupPlaceFavoriteSignals } from "./discoveryPlaceData";

export const dynamic = "force-dynamic";

const LEGACY_RESULT_COUNT = 5;
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
};

export async function GET() {
  try {
    const supabase = createPublicClient();

    const [reviewResult, favoriteResult, bakeryIds] = await Promise.all([
      supabase
        .from("tb_post")
        .select("content_id, rating")
        .eq("board_id", REVIEW_BOARD_ID)
        .eq("use_yn", true)
        .not("rating", "is", null)
        .not("content_id", "is", null),
      supabase.from("tb_place_like").select("place_id"),
      getPublicBakeryPlaceIds(supabase)
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

    const candidateIds = [
      ...new Set([...hotContentIds, ...rankedFavorites.map((item) => item.contentId)])
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
        like_count: likeCounts.get(contentId) ?? 0
      };
    };

    const isPlaceResult = (place: PlaceResult | null): place is PlaceResult => place !== null;

    const reviewPlaces = reviewRankings.home
      .map((item) => toPlaceResult(item.contentId))
      .filter(isPlaceResult);
    const favoritePlaces = rankedFavorites
      .map((item) => toPlaceResult(item.contentId))
      .filter(isPlaceResult);

    const places = hotContentIds.map(toPlaceResult).filter(isPlaceResult);

    return NextResponse.json(
      { places, reviewPlaces, favoritePlaces },
      { headers: publicCacheHeaders(60) }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to fetch top rated places" },
      { headers: noStoreHeaders(), status: 500 }
    );
  }
}

const CONFECTIONERY_LCLSSYSTM3 = "FD030100";
const BAKERY_ADJACENT_LCLSSYSTM2 = ["FD05", "EV03", "EX01", "EX02"];

async function getPublicBakeryPlaceIds(supabase: SupabaseClient): Promise<number[]> {
  const [{ data: confectioneryRows }, { data: bakeryRegistryRows }, { data: adjacentRows }] =
    await Promise.all([
      supabase
        .from("tb_place")
        .select("place_id")
        .or("delete_yn.is.null,delete_yn.eq.N")
        .eq("lclssystm3", CONFECTIONERY_LCLSSYSTM3),
      supabase.from("tb_place_bakery").select("bplc_nm").eq("delete_yn", "N"),
      supabase
        .from("tb_place")
        .select("place_id, title")
        .or("delete_yn.is.null,delete_yn.eq.N")
        .in("lclssystm2", BAKERY_ADJACENT_LCLSSYSTM2)
    ]);
  const ids = new Set<number>((confectioneryRows ?? []).map((row) => row.place_id as number));
  const bakeryNames = (bakeryRegistryRows ?? [])
    .map((row) => (row.bplc_nm as string | null)?.trim())
    .filter((name): name is string => Boolean(name));

  for (const row of (adjacentRows ?? []) as { place_id: number; title: string | null }[]) {
    const title = row.title?.trim();
    if (title && bakeryNames.some((name) => name.includes(title))) ids.add(row.place_id);
  }

  return [...ids];
}

function publicCacheHeaders(seconds: number) {
  return {
    "Cache-Control": "public, max-age=0, must-revalidate",
    "Vercel-CDN-Cache-Control": `public, s-maxage=${seconds}, stale-while-revalidate=${seconds}`
  };
}

function noStoreHeaders() {
  return { "Cache-Control": "private, no-store, max-age=0" };
}
