import { NextResponse } from "next/server";
import {
  HOME_NEED_OPTIONS,
  getHomeRecommendationNeedIds,
  type HomeNeedId
} from "@/features/home/homeData";
import { HomeDataError, loadHomePlaces } from "@/features/home/server/loadHomePlaces";
import { parseHomeExcludedPlaceIds, parseHomeRecommendationSeed } from "./request-policy";

export const dynamic = "force-dynamic";

const allowedNeedIds = new Set<HomeNeedId>(HOME_NEED_OPTIONS.map((option) => option.id));

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim().slice(0, 80);
  const needIds = getHomeRecommendationNeedIds(
    (searchParams.get("needs") ?? "")
      .split(",")
      .filter((value): value is HomeNeedId => allowedNeedIds.has(value as HomeNeedId))
  );
  const recommendationSeed = parseHomeRecommendationSeed(searchParams.get("seed"));
  const excludedPlaceIds = parseHomeExcludedPlaceIds(searchParams.getAll("exclude"));

  try {
    const data = await loadHomePlaces({
      needIds,
      query,
      recommendationSeed,
      excludedPlaceIds
    });
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, no-store" }
    });
  } catch (error) {
    const dataError =
      error instanceof HomeDataError
        ? error
        : new HomeDataError("홈 정보를 불러오지 못했습니다.", "unavailable");
    return NextResponse.json(
      {
        error: dataError.code,
        message:
          dataError.code === "not_configured"
            ? "관광정보 연결 설정을 확인해 주세요."
            : "관광정보를 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요."
      },
      { status: 503 }
    );
  }
}
