import "server-only";
import { unstable_cache } from "next/cache";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabaseConfig } from "@/lib/supabase/config";
import {
  rankHomePlaces,
  selectHomeFestivals,
  selectHomePlacesForDisplay,
  type HomeDataResponse,
  type HomeNeedId,
  type HomePlace
} from "@/features/home/homeData";
import {
  mapHomePlace,
  type PlaceBarrierfreeRow,
  type PlaceDetailRow,
  type PlaceRow
} from "@/features/home/server/homePlaceMapper";

const PLACE_PAGE_SIZE = 500;
const RELATED_ROW_BATCH_SIZE = 150;
let homeDataClient: SupabaseClient | null = null;
const getCachedBaseHomePlaces = unstable_cache(
  async () => fetchNormalizedHomePlaces(),
  ["home-base-places-v3"],
  { revalidate: 300, tags: ["home-places"] }
);

export class HomeDataError extends Error {
  constructor(
    message: string,
    readonly code: "not_configured" | "unavailable"
  ) {
    super(message);
    this.name = "HomeDataError";
  }
}

export async function loadHomePlaces({
  needIds,
  query,
  recommendationSeed,
  excludedPlaceIds
}: {
  needIds: HomeNeedId[];
  query: string;
  recommendationSeed?: number;
  excludedPlaceIds?: readonly string[];
}): Promise<HomeDataResponse> {
  const normalizedPlaces = await getCachedBaseHomePlaces();
  if (!normalizedPlaces.length) {
    return { places: [], festivals: [], source: "한국관광공사 관광정보·무장애 여행정보" };
  }

  const rankedPlaces = rankHomePlaces(normalizedPlaces, needIds, query);
  const discoveryPlaces = needIds.length ? rankHomePlaces(normalizedPlaces, [], "") : rankedPlaces;
  const visitPlaces = rankedPlaces.filter(
    (place) => place.category !== "축제·행사" && place.category !== "여행코스"
  );
  const selectedPlaces = selectHomePlacesForDisplay(visitPlaces, {
    needIds,
    query,
    limit: 32,
    recommendationSeed,
    excludedPlaceIds
  }).slice(0, 16);
  return {
    places: selectedPlaces,
    festivals: selectHomeFestivals(discoveryPlaces, { limit: 3 }),
    source: "한국관광공사 관광정보·무장애 여행정보"
  };
}

async function fetchNormalizedHomePlaces(): Promise<HomePlace[]> {
  const places = await fetchAllPlaces();
  if (!places.length) return [];

  const contentIds = places.map((place) => String(place.contentid));
  const [detailRows, barrierfreeRows] = await Promise.all([
    fetchPlaceDetails(contentIds),
    fetchPlaceBarrierfree(contentIds)
  ]);

  const detailsById = new Map(detailRows.map((detail) => [String(detail.contentid), detail]));
  const barrierfreeById = new Map(
    barrierfreeRows.map((barrierfree) => [String(barrierfree.contentid), barrierfree])
  );

  return places.map((place) => {
    const id = String(place.contentid);
    return mapHomePlace(place, detailsById.get(id), barrierfreeById.get(id));
  });
}

async function fetchAllPlaces(): Promise<PlaceRow[]> {
  const supabase = getHomeDataClient();
  const rows: PlaceRow[] = [];

  for (let from = 0; ; from += PLACE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("tb_place")
      .select("contentid,title,addr1,firstimage,mapx,mapy,modifiedtime,contenttypeid")
      .eq("use_yn", "Y")
      .or("delete_yn.is.null,delete_yn.eq.N")
      .not("title", "is", null)
      .order("modifiedtime", { ascending: false, nullsFirst: false })
      .range(from, from + PLACE_PAGE_SIZE - 1);

    if (error) throw new HomeDataError(error.message, "unavailable");
    const page = (data ?? []) as PlaceRow[];
    rows.push(...page);
    if (page.length < PLACE_PAGE_SIZE) return rows;
  }
}

async function fetchPlaceDetails(contentIds: string[]): Promise<PlaceDetailRow[]> {
  const supabase = getHomeDataClient();
  const batches = chunkValues(contentIds, RELATED_ROW_BATCH_SIZE);
  const results = await Promise.all(
    batches.map(async (batch) => {
      const { data, error } = await supabase
        .from("tb_place_detail_normalized")
        .select(
          "contentid,homepage,tel,overview,usetime,restdate,usefee,parking,infocenter,reservationurl,eventstartdate,eventenddate,modifiedtime"
        )
        .in("contentid", batch);
      if (error) throw new HomeDataError(error.message, "unavailable");
      return (data ?? []) as PlaceDetailRow[];
    })
  );
  return results.flat();
}

async function fetchPlaceBarrierfree(contentIds: string[]): Promise<PlaceBarrierfreeRow[]> {
  const supabase = getHomeDataClient();
  const batches = chunkValues(contentIds, RELATED_ROW_BATCH_SIZE);
  const results = await Promise.all(
    batches.map(async (batch) => {
      const { data, error } = await supabase
        .from("tb_place_barrierfree")
        .select(
          "contentid,parking,route,publictransport,wheelchair,exit,elevator,restroom,handicapetc,braileblock,helpdog,guidehuman,audioguide,bigprint,brailepromotion,guidesystem,blindhandicapetc,signguide,videoguide,hearingroom,hearinghandicapetc,stroller,lactationroom,babysparechair,infantsfamilyetc"
        )
        .in("contentid", batch);
      if (error) throw new HomeDataError(error.message, "unavailable");
      return (data ?? []) as PlaceBarrierfreeRow[];
    })
  );
  return results.flat();
}

function getHomeDataClient(): SupabaseClient {
  if (homeDataClient) return homeDataClient;
  const config = getServerSupabaseConfig();
  if (!config.isConfigured) {
    throw new HomeDataError("Supabase server configuration is missing", "not_configured");
  }
  homeDataClient = createClient(config.url.replace(/\/rest\/v1\/?$/, ""), config.key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return homeDataClient;
}

function chunkValues<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}
