"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { fetchKakaoPlaces } from "@/lib/search/kakaoSearch";

export type RouteOriginPlace = {
  lat: number;
  lng: number;
  name: string;
  address?: string;
};

export function useOriginPlaceSearch(enabled: boolean) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<RouteOriginPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setQuery("");
      setResults([]);
      setLoading(false);
      setSearched(false);
      return;
    }

    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      setSearched(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      void fetchKakaoPlaces(trimmed, undefined, undefined, { originSearch: true })
        .then((places) => {
          if (cancelled) return;
          setResults(
            places
              .filter(
                (place) => place.name && Number.isFinite(place.lat) && Number.isFinite(place.lng)
              )
              .map((place) => ({
                lat: place.lat,
                lng: place.lng,
                name: place.name,
                address: place.address
              }))
          );
          setSearched(true);
        })
        .catch(() => {
          if (cancelled) return;
          setResults([]);
          setSearched(true);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, query]);

  return { inputId, inputRef, query, setQuery, results, loading, searched };
}

export function OriginSearchField({ search }: { search: ReturnType<typeof useOriginPlaceSearch> }) {
  return (
    <>
      <label className="sr-only" htmlFor={search.inputId}>
        출발지
      </label>
      <input
        ref={search.inputRef}
        id={search.inputId}
        type="search"
        value={search.query}
        onChange={(e) => search.setQuery(e.target.value)}
        placeholder="건물, 역, 주소"
        className="border-hairline focus:ring-brand-500 mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm focus:ring-2 focus:outline-none"
        autoComplete="off"
      />
    </>
  );
}

export function OriginSearchResults({
  search,
  onSelect
}: {
  search: ReturnType<typeof useOriginPlaceSearch>;
  onSelect: (place: RouteOriginPlace) => void;
}) {
  return (
    <div className="max-h-48 overflow-y-auto">
      {search.loading ? (
        <p className="text-stone flex items-center gap-1.5 py-3 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          장소를 찾는 중…
        </p>
      ) : null}
      {!search.loading && search.searched && search.results.length === 0 ? (
        <p className="text-stone py-3 text-xs">
          검색 결과가 없어요. 건물명이나 주소를 다시 입력해 주세요.
        </p>
      ) : null}
      {!search.loading && search.results.length > 0 ? (
        <ul className="divide-hairline divide-y">
          {search.results.map((place, index) => (
            <li key={`${place.lat},${place.lng},${index}`}>
              <button
                type="button"
                onClick={() => onSelect(place)}
                className="hover:bg-brand-50 flex w-full items-start gap-2 px-1 py-2.5 text-left"
              >
                <MapPin className="text-brand-700 mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0">
                  <span className="text-ink block truncate text-sm font-semibold">
                    {place.name}
                  </span>
                  {place.address ? (
                    <span className="text-stone mt-0.5 block truncate text-[11px]">
                      {place.address}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
