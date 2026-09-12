import { NextResponse } from "next/server";
import { fetchCurrentWeather } from "@/lib/current-weather";
import { fetchTourWeather } from "@/lib/tour-weather";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const startedAt = Date.now();
  const url = new URL(request.url);
  const location = url.searchParams.get("location")?.trim() || "대전";
  const weatherSensitive = url.searchParams.get("weatherSensitive") !== "false";
  const currentOnly = url.searchParams.get("mode") === "current";

  try {
    if (currentOnly) {
      const currentWeather = await fetchCurrentWeather();
      return NextResponse.json(
        {
          currentWeather,
          ok: currentWeather.status === "ready"
        },
        { headers: weatherHeaders(currentWeather.status === "ready", startedAt) }
      );
    }

    const [result, currentWeather] = await Promise.all([
      fetchTourWeather({ location, weatherSensitive }),
      fetchCurrentWeather()
    ]);

    return NextResponse.json(
      {
        currentWeather,
        ok: currentWeather.status === "ready" || result.status === "ready",
        ...result
      },
      {
        headers: weatherHeaders(
          currentWeather.status === "ready" &&
            (result.status === "ready" || result.status === "not_requested"),
          startedAt
        )
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch weather", ok: false },
      { headers: weatherHeaders(false, startedAt), status: 502 }
    );
  }
}

function weatherHeaders(cacheable: boolean, startedAt: number) {
  return {
    "Cache-Control": cacheable
      ? "public, max-age=0, must-revalidate"
      : "private, no-store, max-age=0",
    ...(cacheable
      ? { "Vercel-CDN-Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" }
      : {}),
    "Server-Timing": `weather;dur=${Math.max(0, Date.now() - startedAt)}`
  };
}
