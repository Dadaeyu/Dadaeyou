import { NextResponse } from "next/server";
import { fetchCurrentWeather } from "@/lib/current-weather";
import { fetchTourWeather } from "@/lib/tour-weather";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const location = url.searchParams.get("location")?.trim() || "대전";
  const weatherSensitive = url.searchParams.get("weatherSensitive") !== "false";
  const [result, currentWeather] = await Promise.all([
    fetchTourWeather({ location, weatherSensitive }),
    fetchCurrentWeather()
  ]);

  return NextResponse.json({
    currentWeather,
    ok: currentWeather.status === "ready" || result.status === "ready",
    ...result
  });
}
