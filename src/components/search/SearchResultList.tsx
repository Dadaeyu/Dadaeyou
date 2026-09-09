"use client";

import Image from "next/image";
import { Heart, MapPin, Star } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { SearchPlace } from "@/lib/search/kakaoSearch";

// DB(tourism)/카카오 검색 결과 목록. usePlaceSearch()의 searchPlaces를 그대로 넘기면 된다.
export default function SearchResultList({
  places,
  onSelect
}: {
  places: SearchPlace[];
  onSelect: (id: string) => void;
}) {
  return (
    <>
      {places.map((sp) => {
        // 읽어주기: "이름, 주소, 별점 N점, 즐겨찾기 N개" 순서로 고정. 화면에 보이는 값과
        // 맞추기 위해 별점 없음은 화면과 동일하게 "0.0점"으로 읽는다(카카오 출처는 두 값이
        // 아예 없어 자동으로 빠진다).
        const ratingLabel =
          sp.average_rating !== undefined
            ? `별점 ${sp.average_rating != null ? sp.average_rating.toFixed(1) : "0.0"}점`
            : null;
        const likeLabel = sp.like_count !== undefined ? `즐겨찾기 ${sp.like_count}개` : null;
        const resultAriaLabel = [sp.name, sp.address, ratingLabel, likeLabel]
          .filter(Boolean)
          .join(", ");

        return (
          <button
            key={sp.id}
            onClick={() => onSelect(sp.id)}
            aria-label={resultAriaLabel}
            data-speak-group="true"
            className="group w-full border-b border-gray-50 px-4 py-3 text-left transition-colors hover:bg-gray-50"
          >
            <div className="flex items-start gap-2">
              {sp.image ? (
                <Image
                  src={sp.image}
                  alt={sp.name}
                  width={40}
                  height={40}
                  unoptimized
                  className="h-10 w-10 shrink-0 rounded-lg bg-gray-50 object-contain"
                />
              ) : (
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${sp.source === "kakao" ? "bg-cyan-50" : "bg-gray-100"}`}
                >
                  <MapPin
                    className={`h-4 w-4 ${sp.source === "kakao" ? "text-cyan-400" : "text-gray-300"}`}
                  />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1">
                  <p
                    aria-hidden="true"
                    className="group-hover:text-brand-700 min-w-0 truncate text-sm font-medium text-gray-800 transition-colors"
                  >
                    {sp.name}
                  </p>
                  {sp.matchedAccessibility && (
                    <Badge
                      tone="brand"
                      shape="tag"
                      className="shrink-0 px-1.5 py-0.5 text-[10px] leading-none"
                    >
                      접근성
                    </Badge>
                  )}
                  {sp.matchedTheme && (
                    <Badge
                      tone="tag"
                      shape="tag"
                      className="shrink-0 px-1.5 py-0.5 text-[10px] leading-none"
                    >
                      선호테마
                    </Badge>
                  )}
                </div>
                {sp.address && (
                  <p aria-hidden="true" className="mt-0.5 truncate text-xs text-gray-400">
                    {sp.address}
                  </p>
                )}
                {sp.source === "kakao" && sp.category && (
                  <p className="mt-0.5 truncate text-xs text-cyan-600">
                    {sp.category.split(" > ").pop()}
                  </p>
                )}
                {(sp.average_rating !== undefined || sp.like_count !== undefined) && (
                  <div className="mt-0.5 flex items-center gap-3 text-xs text-gray-500">
                    {sp.average_rating !== undefined && (
                      <div className="flex items-center gap-1">
                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                        <span>
                          {sp.average_rating != null ? sp.average_rating.toFixed(1) : "0.0"}
                        </span>
                      </div>
                    )}
                    {sp.like_count !== undefined && (
                      <div className="flex items-center gap-1">
                        <Heart className="h-3 w-3 fill-red-400 text-red-400" />
                        <span>{sp.like_count}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </>
  );
}
