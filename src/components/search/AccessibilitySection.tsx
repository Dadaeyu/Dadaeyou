"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

const CATEGORY_ICON: Record<string, string> = {
  보행: "♿",
  시각: "👁️",
  청각: "👂",
  영유아: "🍼"
};

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .trim();
}

// 관광지 상세 패널의 접근성 정보 아코디언 (보행/시각/청각/영유아 카테고리별 상세 항목)
export default function AccessibilitySection({
  groups
}: {
  groups: { category: string; items: { label: string; text: string }[] }[];
}) {
  const [openCategory, setOpenCategory] = useState<string | null>(null);

  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-gray-800">접근성 정보</h4>
      <div className="space-y-2">
        {groups.map((group) => {
          const icon = CATEGORY_ICON[group.category] ?? "📋";
          const isOpen = openCategory === group.category;
          const tagItems = group.items.slice(0, 3);
          const extraCount = Math.max(0, group.items.length - 3);
          const summary = group.items[0] ? stripHtml(group.items[0].text) : "";

          return (
            <div key={group.category} className="bg-brand-50 overflow-hidden rounded-xl">
              {/* 헤더 */}
              <button
                onClick={() => setOpenCategory(isOpen ? null : group.category)}
                className="w-full p-3 text-left"
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-base leading-none">{icon}</span>
                    <span className="text-xs font-semibold text-gray-800">{group.category}</span>
                  </div>
                  <ChevronDown
                    className={`h-3.5 w-3.5 shrink-0 text-gray-500 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                  />
                </div>

                {/* 접힌 상태: 첫 항목 텍스트 요약 + 태그 */}
                {!isOpen && (
                  <>
                    {summary && (
                      <p className="mb-2 line-clamp-2 text-left text-xs text-gray-600">{summary}</p>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {tagItems.map((item) => (
                        <span
                          key={item.label}
                          className="text-brand-700 border-brand-100 rounded-full border bg-white/80 px-2 py-0.5 text-[10px] font-medium"
                        >
                          {item.label}
                        </span>
                      ))}
                      {extraCount > 0 && (
                        <span className="rounded-full border border-gray-200 bg-white/80 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                          +{extraCount}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </button>

              {/* 펼친 상태: grid-rows 트릭으로 자연스러운 애니메이션 */}
              <div
                className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
                  isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                }`}
              >
                <div className="min-h-0 overflow-hidden">
                  <div className="border-brand-100 space-y-3 border-t px-3 pt-3 pb-3">
                    {group.items.map((item) => (
                      <div key={item.label} data-speakable>
                        <div className="mb-0.5 flex items-center gap-1.5">
                          <span className="bg-brand-500 h-1.5 w-1.5 shrink-0 rounded-full" />
                          <span className="text-xs font-semibold text-gray-800">{item.label}</span>
                        </div>
                        <p className="pl-3 text-xs leading-relaxed text-gray-600">
                          {stripHtml(item.text)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
