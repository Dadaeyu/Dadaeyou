"use client";

/* eslint-disable @next/next/no-img-element */

import { MapPin } from "lucide-react";
import { useState } from "react";
import { buildHomeFallbackCopy, normalizeHomeImageSource } from "@/features/home/homePresentation";

export function HomePlaceImage({
  src,
  alt,
  className = "",
  fallbackSources = [],
  compactFallback = false
}: {
  src: string | null;
  alt: string;
  className?: string;
  fallbackSources?: readonly (string | null | undefined)[];
  compactFallback?: boolean;
}) {
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const candidates = [src, ...fallbackSources]
    .flatMap((source) => {
      const normalized = normalizeHomeImageSource(source);
      return normalized ? [normalized] : [];
    })
    .filter((source, index, allSources) => allSources.indexOf(source) === index);
  const activeSource = candidates.find((source) => !failedSources.includes(source)) ?? null;
  const fallbackCopy = buildHomeFallbackCopy({ compact: compactFallback });

  if (!activeSource) {
    return (
      <span
        className={`text-brand-900 relative isolate block min-h-full overflow-hidden bg-[#e5f2ed] ${className}`}
        role="img"
        aria-label={`${alt}의 등록된 대표 사진이 없습니다.`}
        data-image-state="fallback"
      >
        <span
          className="absolute inset-0 [background-image:linear-gradient(rgba(31,143,126,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(31,143,126,0.12)_1px,transparent_1px)] [background-size:2rem_2rem] opacity-60"
          aria-hidden="true"
        />
        <span
          className="border-brand-300/45 absolute top-[18%] -left-[12%] h-[72%] w-[78%] -rotate-6 rounded-[50%] border-[0.7rem]"
          aria-hidden="true"
        />
        <span
          className="bg-brand-700 absolute top-[29%] left-[19%] h-2.5 w-2.5 rounded-full ring-4 ring-white/75"
          aria-hidden="true"
        />
        <span
          className={`absolute inset-0 z-10 flex items-center justify-center text-center ${
            compactFallback ? "p-2 sm:p-5" : "p-4 sm:p-5"
          }`}
        >
          <span className="flex max-w-[15rem] flex-col items-center">
            <span
              className={`border-brand-200/80 text-brand-800 grid place-items-center rounded-2xl border bg-white/90 shadow-sm backdrop-blur-sm ${
                compactFallback ? "size-9 sm:size-11" : "size-11"
              }`}
            >
              <MapPin className="h-5 w-5" aria-hidden="true" />
            </span>
            <span
              className={`text-ink block leading-tight font-semibold break-keep ${
                compactFallback
                  ? "mt-2 text-[0.7rem] sm:mt-3 sm:text-base"
                  : "mt-3 text-sm sm:text-base"
              }`}
            >
              {fallbackCopy.title}
            </span>
            {fallbackCopy.description ? (
              <span className="text-brand-900/65 mt-1 hidden text-xs leading-5 min-[360px]:block">
                {fallbackCopy.description}
              </span>
            ) : null}
          </span>
        </span>
      </span>
    );
  }

  return (
    <img
      src={
        activeSource.startsWith("/")
          ? activeSource
          : `/api/home/image?src=${encodeURIComponent(activeSource)}`
      }
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      data-image-state="loaded"
      onError={() =>
        setFailedSources((currentSources) =>
          currentSources.includes(activeSource) ? currentSources : [...currentSources, activeSource]
        )
      }
    />
  );
}
