"use client";

import { BusFront, ExternalLink, Phone } from "lucide-react";

const SERVICE_PHONE = "1588-1668";
const SERVICE_PHONE_HREF = "tel:15881668";
const SERVICE_URL = "https://www.djcall.or.kr/";

export function HomeTravelSupport({ easyMode = false }: { easyMode?: boolean }) {
  if (easyMode) {
    return (
      <section
        className="border-easy-navy rounded-[1.75rem] border-[3px] bg-white p-4 sm:p-6"
        aria-labelledby="easy-travel-support-title"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-3 text-xl font-extrabold">
              <span
                className="border-easy-navy bg-easy-yellow grid size-14 place-items-center rounded-full border-[3px]"
                aria-hidden="true"
              >
                <BusFront className="h-8 w-8" />
              </span>
              대전 이동지원
            </p>
            <h2
              id="easy-travel-support-title"
              className="mt-3 text-3xl leading-tight font-extrabold break-keep"
            >
              사랑나눔콜로 이동을 요청할 수 있어요
            </h2>
            <p className="text-easy-copy mt-2 text-lg leading-7 font-bold break-keep">
              대중교통 이용이 어려운 교통약자를 위한 특별교통수단입니다. 이용 대상과 등록 방법은
              공식 안내에서 확인하세요.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:w-[24rem] lg:grid-cols-1">
            <a
              href={SERVICE_PHONE_HREF}
              aria-label="사랑나눔콜 1588-1668로 전화하기"
              className="border-easy-navy bg-easy-mint flex min-h-20 items-center justify-between gap-4 rounded-2xl border-[3px] px-5 text-xl font-extrabold text-white shadow-[0_7px_0_var(--color-easy-navy)] transition-transform active:translate-y-1 active:shadow-[0_3px_0_var(--color-easy-navy)]"
            >
              <span className="inline-flex items-center gap-3">
                <Phone className="h-7 w-7" aria-hidden="true" />
                전화하기 {SERVICE_PHONE}
              </span>
            </a>
            <a
              href={SERVICE_URL}
              target="_blank"
              rel="noreferrer"
              aria-label="대전교통약자이동지원센터 공식 안내 새 창에서 보기"
              className="border-easy-navy text-easy-navy flex min-h-20 items-center justify-between gap-4 rounded-2xl border-[3px] bg-white px-5 text-xl font-extrabold shadow-[0_7px_0_var(--color-easy-navy)] transition-transform active:translate-y-1 active:shadow-[0_3px_0_var(--color-easy-navy)]"
            >
              공식 안내 보기
              <ExternalLink className="h-7 w-7" aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className="border-hairline bg-surface-soft rounded-[1.25rem] border p-4 sm:p-5"
      aria-labelledby="travel-support-title"
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="flex min-w-0 gap-3">
          <span
            className="bg-brand-50 text-brand-800 grid size-11 shrink-0 place-items-center rounded-xl"
            aria-hidden="true"
          >
            <BusFront className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-brand-800 text-xs font-semibold">대전 이동지원</p>
            <h2 id="travel-support-title" className="text-ink mt-1 text-lg font-semibold">
              사랑나눔콜
            </h2>
            <p className="text-steel mt-1 text-sm leading-6 break-keep">
              대중교통 이용이 어려운 교통약자를 위한 특별교통수단입니다. 이용 대상과 등록 방법을
              확인한 뒤 이동을 요청하세요.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 md:w-[19rem]">
          <a
            href={SERVICE_PHONE_HREF}
            aria-label="사랑나눔콜 1588-1668로 전화하기"
            className="bg-brand-800 hover:bg-brand-900 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold text-white transition-colors"
          >
            <Phone className="h-4 w-4" aria-hidden="true" />
            전화 {SERVICE_PHONE}
          </a>
          <a
            href={SERVICE_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="대전교통약자이동지원센터 공식 안내 새 창에서 보기"
            className="border-hairline text-ink hover:bg-brand-50 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border bg-white px-3 text-sm font-semibold transition-colors"
          >
            공식 안내
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  );
}
