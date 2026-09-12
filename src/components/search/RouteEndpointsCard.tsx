"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import {
  OriginSearchField,
  OriginSearchResults,
  useOriginPlaceSearch,
  type RouteOriginPlace
} from "./OriginPlacePicker";

export default function RouteEndpointsCard({
  destinationName,
  origin,
  searching,
  onPickOrigin,
  onChangeOrigin,
  onClose,
  children
}: {
  destinationName: string;
  origin?: RouteOriginPlace | null;
  searching: boolean;
  onPickOrigin?: (place: RouteOriginPlace) => void;
  onChangeOrigin?: () => void;
  onClose?: () => void;
  children?: ReactNode;
}) {
  const search = useOriginPlaceSearch(searching);

  return (
    <div className="border-hairline bg-background overflow-hidden rounded-2xl border shadow-sm">
      <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-1">
        <p className="text-ink text-sm font-semibold">경로</p>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            className="text-stone hover:text-ink rounded-full p-1"
            aria-label="경로 안내 닫기"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="flex gap-3 px-3 pb-3">
        <div className="flex w-3 shrink-0 flex-col items-center pt-1.5 pb-1" aria-hidden>
          <span className="bg-brand-700 h-2.5 w-2.5 rounded-full" />
          <span className="bg-hairline my-1 w-px flex-1" />
          <span className="border-hairline bg-background h-2.5 w-2.5 rounded-full border-2" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="pb-3">
            <p className="text-stone text-[11px] font-medium">출발지</p>
            {searching ? (
              <OriginSearchField search={search} />
            ) : (
              <button
                type="button"
                onClick={() => onChangeOrigin?.()}
                className="mt-0.5 w-full rounded-lg py-0.5 text-left"
              >
                <span className="text-ink block truncate text-sm font-semibold">
                  {origin?.name ?? "출발지를 입력하세요"}
                </span>
                {origin?.address ? (
                  <span className="text-stone mt-0.5 block truncate text-[11px]">
                    {origin.address}
                  </span>
                ) : null}
              </button>
            )}
          </div>

          <div className="border-hairline border-t pt-3">
            <p className="text-stone text-[11px] font-medium">도착지</p>
            <p className="text-ink mt-0.5 truncate text-sm font-semibold">{destinationName}</p>
          </div>
        </div>
      </div>

      {searching && (search.loading || search.searched) ? (
        <div className="border-hairline border-t px-2">
          <OriginSearchResults search={search} onSelect={(place) => onPickOrigin?.(place)} />
        </div>
      ) : null}

      {children ? (
        <div className="border-hairline bg-surface-soft/70 border-t px-3 py-3">{children}</div>
      ) : null}
    </div>
  );
}
