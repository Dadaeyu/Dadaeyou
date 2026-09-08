"use client";

import { useEffect, useState } from "react";
import { CloudSun, ExternalLink } from "lucide-react";
import {
  buildHomeWeatherNotice,
  HOME_WEATHER_TIMEOUT_MS,
  OFFICIAL_FORECAST_HREF,
  type HomeWeatherApiPayload,
  type HomeWeatherNotice as HomeWeatherNoticeState
} from "@/features/home/home-weather";

export function HomeWeatherNotice({ easyMode = false }: { easyMode?: boolean }) {
  const [notice, setNotice] = useState<HomeWeatherNoticeState>(() => buildHomeWeatherNotice(null));

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), HOME_WEATHER_TIMEOUT_MS);

    fetch("/api/weather?location=%EB%8C%80%EC%A0%84", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: HomeWeatherApiPayload | null) => {
        if (!controller.signal.aborted) setNotice(buildHomeWeatherNotice(payload));
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setNotice(buildHomeWeatherNotice({ status: "unavailable" }));
      })
      .finally(() => window.clearTimeout(timer));

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, []);

  if (easyMode) {
    return <EasyWeatherNotice notice={notice} />;
  }

  return (
    <section
      className="border-hairline bg-surface-soft rounded-[1.25rem] border p-4 sm:p-5"
      aria-labelledby="home-weather-title"
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="flex min-w-0 gap-3">
          <span
            className="bg-brand-50 text-brand-800 grid size-11 shrink-0 place-items-center rounded-xl"
            aria-hidden="true"
          >
            <CloudSun className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-brand-800 text-xs font-semibold">날씨와 계절 안내</p>
            <h2 id="home-weather-title" className="text-ink mt-1 text-lg font-semibold">
              {notice.season.summary}
            </h2>
            <ul className="text-steel mt-2 grid gap-1 text-sm leading-6 break-keep">
              {notice.season.tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>
        </div>

        <WeatherStatus notice={notice} />
      </div>
    </section>
  );
}

function EasyWeatherNotice({ notice }: { notice: HomeWeatherNoticeState }) {
  return (
    <section
      className="border-easy-navy rounded-[1.75rem] border-[3px] bg-white p-4 sm:p-6"
      aria-labelledby="easy-home-weather-title"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-3 text-xl font-extrabold">
            <span
              className="border-easy-navy bg-easy-yellow grid size-14 place-items-center rounded-full border-[3px]"
              aria-hidden="true"
            >
              <CloudSun className="h-8 w-8" />
            </span>
            날씨와 계절
          </p>
          <h2
            id="easy-home-weather-title"
            className="mt-3 text-3xl leading-tight font-extrabold break-keep"
          >
            {notice.season.summary}
          </h2>
          <ul className="text-easy-copy mt-3 grid gap-2 text-lg leading-7 font-bold break-keep">
            {notice.season.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>

        <WeatherStatus notice={notice} easyMode />
      </div>
    </section>
  );
}

function WeatherStatus({
  easyMode = false,
  notice
}: {
  easyMode?: boolean;
  notice: HomeWeatherNoticeState;
}) {
  const linkClassName = easyMode
    ? "border-easy-navy text-easy-navy inline-flex min-h-16 items-center justify-center gap-2 rounded-2xl border-[3px] bg-white px-5 text-lg font-extrabold"
    : "border-hairline text-ink hover:bg-brand-50 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border bg-white px-3 text-sm font-semibold transition-colors";

  if (notice.weather.status === "fallback") {
    return (
      <div className={easyMode ? "grid gap-3 lg:w-[24rem]" : "grid gap-3 md:w-[19rem]"}>
        <p
          className={
            easyMode ? "text-easy-copy text-lg leading-7 font-bold" : "text-steel text-sm leading-6"
          }
        >
          {notice.weather.message}
        </p>
        <a href={OFFICIAL_FORECAST_HREF} target="_blank" rel="noreferrer" className={linkClassName}>
          공식 예보 보기
          <ExternalLink className={easyMode ? "h-7 w-7" : "h-4 w-4"} aria-hidden="true" />
        </a>
      </div>
    );
  }

  return (
    <div className={easyMode ? "grid gap-3 lg:w-[24rem]" : "grid gap-2 md:w-[19rem]"}>
      <p
        className={
          easyMode ? "text-xl leading-8 font-extrabold" : "text-ink text-sm leading-6 font-semibold"
        }
      >
        {notice.weather.area} · {notice.weather.observedAt}
      </p>
      <p
        className={
          easyMode ? "text-easy-copy text-lg leading-7 font-bold" : "text-steel text-sm leading-6"
        }
      >
        {[notice.weather.indexLabel, notice.weather.gradeLabel].filter(Boolean).join(" · ")}
      </p>
      <p
        className={
          easyMode ? "text-easy-copy text-base leading-6 font-bold" : "text-steel text-xs leading-5"
        }
      >
        {notice.weather.note}
      </p>
      {notice.weather.gradeAdvice ? (
        <p
          className={
            easyMode
              ? "text-easy-navy text-base leading-6 font-extrabold"
              : "text-brand-800 text-xs leading-5 font-semibold"
          }
        >
          {notice.weather.gradeAdvice}
        </p>
      ) : null}
      {notice.weather.tourismClimateLabel ? (
        <p
          className={
            easyMode ? "text-easy-copy text-sm leading-5 font-bold" : "text-stone text-xs leading-5"
          }
        >
          보조 정보: {notice.weather.tourismClimateLabel}
        </p>
      ) : null}
      <p
        className={
          easyMode ? "text-easy-copy text-sm leading-5 font-bold" : "text-stone text-xs leading-5"
        }
      >
        출처: {notice.weather.source}
      </p>
      <a href={OFFICIAL_FORECAST_HREF} target="_blank" rel="noreferrer" className={linkClassName}>
        공식 예보 보기
        <ExternalLink className={easyMode ? "h-7 w-7" : "h-4 w-4"} aria-hidden="true" />
      </a>
    </div>
  );
}
