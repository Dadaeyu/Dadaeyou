"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import Link from "next/link";
import {
  Accessibility,
  Baby,
  CalendarDays,
  CalendarX2,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  Clock3,
  Ear,
  ExternalLink,
  Eye,
  MapPin,
  Phone,
  Share2,
  WalletCards,
  X
} from "lucide-react";
import { HomePlaceImage } from "@/features/home/HomePlaceImage";
import {
  formatDistance,
  formatSourceDate,
  getAccessibilityGroups,
  getConfirmedHomeEvidenceForNeeds,
  getHomeEvidenceStatus,
  getNeedEvidenceChecks,
  sortHomeEvidenceForNeeds,
  type HomeAccessibilityEvidence,
  type HomeAccessibilityGroup,
  type HomeEvidenceStatus,
  type HomeNeedId,
  type RankedHomePlace
} from "@/features/home/homeData";
import {
  buildHomePlaceMapHref,
  formatHomeDetailValue,
  formatHomeEventPeriod,
  shouldShowHomeParkingDetail,
  summarizeHomeFee,
  summarizeHomeEvidence
} from "@/features/home/homePresentation";

type PlaceSectionId = "decision" | "visit" | "access";

const SECTION_LINKS: Array<{ id: PlaceSectionId; label: string }> = [
  { id: "decision", label: "선택한 조건" },
  { id: "visit", label: "방문 정보" },
  { id: "access", label: "이용 편의" }
];

const GROUP_ICONS: Record<
  HomeAccessibilityGroup["id"],
  ComponentType<{ className?: string; "aria-hidden"?: boolean }>
> = {
  mobility: Accessibility,
  visual: Eye,
  hearing: Ear,
  family: Baby
};

export function HomePlaceDialog({
  place,
  selectedNeedIds,
  onClose
}: {
  place: RankedHomePlace;
  selectedNeedIds: readonly HomeNeedId[];
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const groups = useMemo(() => getAccessibilityGroups(place.accessibility), [place.accessibility]);
  const needChecks = useMemo(
    () => getNeedEvidenceChecks(place, selectedNeedIds),
    [place, selectedNeedIds]
  );
  const sourceDate = formatSourceDate(place.sourceUpdatedAt);
  const distance = formatDistance(place.distanceMeters);
  const decisionChecks = needChecks;
  const usesSelectedNeedSummary = decisionChecks.length > 0;
  const confirmedSummaryEvidence = getConfirmedHomeEvidenceForNeeds(place, selectedNeedIds);
  const hasStrictCondition = selectedNeedIds.length > 0;
  const summaryEvidence = sortHomeEvidenceForNeeds(
    hasStrictCondition ? confirmedSummaryEvidence : place.accessibility,
    selectedNeedIds
  )
    .filter((item) => getHomeEvidenceStatus(item) === "available")
    .slice(0, 3);
  const visibleSectionLinks = usesSelectedNeedSummary
    ? SECTION_LINKS
    : SECTION_LINKS.filter((section) => section.id !== "decision");
  const hasDialogSummary = usesSelectedNeedSummary || summaryEvidence.length > 0;
  const hasLongOverview = (place.overview?.length ?? 0) > 220;
  const eventPeriod = formatHomeEventPeriod(place.eventStartDate, place.eventEndDate);
  const showParkingDetail = shouldShowHomeParkingDetail(place.parking);
  const phoneHref = place.phone ? `tel:${place.phone.replace(/[^\d+]/g, "")}` : null;
  const mapHref = buildHomePlaceMapHref(place);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      document.documentElement.style.overflow = previousDocumentOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  const scrollToSection = (sectionId: PlaceSectionId) => {
    const section = dialogRef.current?.querySelector<HTMLElement>(
      `[data-place-section="${sectionId}"]`
    );
    section?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start"
    });
    section?.focus({ preventScroll: true });
  };

  const sharePlace = async () => {
    setShareStatus(null);
    const shareUrl = `${window.location.origin}${mapHref}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: place.title,
          text: `${place.title} 관광·접근성 정보를 확인해 보세요.`,
          url: shareUrl
        });
        setShareStatus("공유 메뉴를 열었습니다.");
        return;
      }
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        setShareStatus("장소 링크를 복사했습니다.");
        return;
      }
      setShareStatus("이 브라우저에서는 링크 복사를 지원하지 않습니다.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setShareStatus("공유하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-0 backdrop:bg-black/55 md:m-auto md:h-[min(90dvh,54rem)] md:w-[min(64rem,calc(100%-3rem))] md:rounded-3xl md:shadow-2xl"
      aria-labelledby="place-dialog-title"
      aria-describedby={hasDialogSummary ? "place-dialog-summary" : undefined}
    >
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden bg-white md:rounded-3xl">
        <button
          type="button"
          onClick={onClose}
          className="text-slate hover:bg-surface absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 z-30 grid h-11 w-11 place-items-center rounded-full bg-white/95 shadow-md ring-1 ring-black/10 backdrop-blur-sm transition-colors md:top-4 md:right-4"
          aria-label="장소 정보 닫기"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <section className="border-hairline border-b md:grid md:min-h-[25rem] md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <div className="min-w-0 p-3 sm:p-4 md:p-5">
              <div className="bg-surface relative aspect-[16/9] min-h-0 overflow-hidden rounded-2xl sm:aspect-[16/10] md:aspect-auto md:h-[22.5rem]">
                <HomePlaceImage
                  src={place.imageUrl}
                  alt={place.title}
                  className="block h-full w-full object-cover"
                />
                <span className="text-brand-900 absolute bottom-4 left-4 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold shadow-sm ring-1 ring-black/10 backdrop-blur-sm">
                  {place.category ?? "대전 관광"}
                </span>
              </div>
            </div>
            <div className="flex flex-col justify-center p-4 pt-4 sm:p-7 md:p-8 md:pr-12">
              <h2
                id="place-dialog-title"
                className="text-ink pr-10 text-[1.75rem] leading-[1.15] font-semibold tracking-[-0.025em] [overflow-wrap:anywhere] sm:text-3xl md:pr-0 md:text-4xl"
              >
                {place.title}
              </h2>
              {place.address ? (
                <p className="text-slate mt-3 flex items-start gap-2 text-sm leading-6 sm:text-base">
                  <MapPin className="text-brand-700 mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                  <span>{place.address}</span>
                </p>
              ) : (
                <p className="text-steel mt-4">주소는 방문 전에 운영처에서 확인해 주세요.</p>
              )}
              {distance ? (
                <p className="text-steel mt-3 text-sm">내 위치에서 직선거리 {distance}</p>
              ) : null}

              {!usesSelectedNeedSummary && summaryEvidence.length ? (
                <dl
                  id="place-dialog-summary"
                  className="border-hairline mt-5 grid gap-2 border-y py-4 sm:mt-6 sm:grid-cols-3"
                >
                  {summaryEvidence.map((item) => (
                    <ConfirmedFact key={item.key} label={item.label} value={item.value} />
                  ))}
                </dl>
              ) : null}
            </div>
          </section>

          <nav
            className="border-hairline z-20 hidden border-b bg-white sm:sticky sm:top-0 sm:block sm:bg-white/95 sm:backdrop-blur-md"
            aria-label="장소 정보 바로가기"
          >
            <div
              className={`mx-auto grid max-w-3xl gap-1 px-3 py-1.5 sm:px-5 sm:py-2 ${
                visibleSectionLinks.length === 3 ? "grid-cols-3" : "grid-cols-2"
              }`}
            >
              {visibleSectionLinks.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => scrollToSection(section.id)}
                  className="text-slate hover:bg-surface hover:text-brand-800 min-h-11 min-w-0 rounded-lg px-1 text-sm leading-tight font-semibold [overflow-wrap:anywhere] transition-colors sm:px-2"
                >
                  {section.label}
                </button>
              ))}
            </div>
          </nav>

          <div className="mx-auto max-w-4xl px-4 py-3 sm:px-6 sm:py-9">
            {usesSelectedNeedSummary ? (
              <section
                id="place-dialog-summary"
                data-place-section="decision"
                tabIndex={-1}
                className="scroll-mt-14 outline-none"
                aria-labelledby="decision-title"
              >
                <SectionHeading
                  id="decision-title"
                  eyebrow="선택한 조건"
                  title="내 조건에서 먼저 볼 내용"
                  description="선택한 조건과 직접 관련된 정보만 모았습니다."
                />

                <div className="border-hairline mt-5 divide-y overflow-hidden rounded-2xl border bg-white">
                  {decisionChecks.map((check) => (
                    <NeedCheckRow
                      key={check.id}
                      check={check}
                      detail={
                        check.id === "location-distance"
                          ? distance
                            ? `직선거리 ${distance}입니다. 실제 이동 경로 거리는 지도에서 다시 확인해 주세요.`
                            : "내 위치를 사용하지 않아 거리를 계산하지 못했습니다."
                          : undefined
                      }
                    />
                  ))}
                </div>
              </section>
            ) : null}

            <section
              data-place-section="visit"
              data-speakable
              tabIndex={-1}
              className={`${usesSelectedNeedSummary ? "mt-10 border-t pt-9" : ""} border-hairline scroll-mt-14 outline-none`}
              aria-labelledby="visit-title"
            >
              <SectionHeading id="visit-title" title="방문 정보" />

              <dl className="border-hairline mt-5 divide-y border-y">
                {eventPeriod ? (
                  <VisitInfoRow icon={CalendarDays} label="행사 기간" value={eventPeriod} />
                ) : null}
                <VisitInfoRow icon={Clock3} label="운영시간" value={place.hours} critical />
                {place.restDate ? (
                  <VisitInfoRow icon={CalendarX2} label="휴무일" value={place.restDate} />
                ) : null}
                {place.fee ? (
                  <VisitInfoRow icon={WalletCards} label="이용요금" value={place.fee} />
                ) : null}
                <VisitInfoRow icon={Phone} label="연락처" value={place.phone} critical />
                <VisitInfoRow icon={MapPin} label="주소" value={place.address} critical />
                {showParkingDetail ? (
                  <VisitInfoRow icon={Accessibility} label="주차" value={place.parking} />
                ) : null}
              </dl>

              {place.officialUrl || place.reservationUrl ? (
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  {place.officialUrl ? (
                    <VisitResourceLink
                      href={place.officialUrl}
                      label="공식 홈페이지"
                      description="운영·시설의 최신 정보 확인"
                      placeTitle={place.title}
                    />
                  ) : null}
                  {place.reservationUrl ? (
                    <VisitResourceLink
                      href={place.reservationUrl}
                      label="예약 페이지"
                      description="예약 가능 여부 확인"
                      placeTitle={place.title}
                    />
                  ) : null}
                </div>
              ) : null}
            </section>

            <section
              data-place-section="access"
              tabIndex={-1}
              className="border-hairline mt-10 scroll-mt-14 border-t pt-9 outline-none"
              aria-labelledby="access-title"
            >
              <SectionHeading
                id="access-title"
                title="이용 편의"
                description="이동과 안내에 필요한 편의 정보를 항목별로 확인해 보세요."
              />

              {groups.length ? (
                <div className="mt-6 space-y-3">
                  {groups.map((group) => (
                    <AccessGroup key={group.id} group={group} />
                  ))}
                </div>
              ) : (
                <div className="bg-surface-soft text-slate mt-5 rounded-2xl p-4 leading-6">
                  접근성 세부 안내가 아직 충분하지 않아요. 방문 전 장소에 문의해 주세요.
                </div>
              )}
            </section>

            {place.overview ? (
              <section
                className="border-hairline mt-10 border-t pt-9"
                aria-labelledby="overview-title"
              >
                <h2 id="overview-title" className="text-ink text-2xl font-semibold">
                  장소 소개
                </h2>
                <p
                  className={`text-slate mt-3 max-w-[68ch] text-base leading-7 ${
                    hasLongOverview && !overviewOpen ? "line-clamp-5" : ""
                  }`}
                >
                  {formatHomeDetailValue(place.overview, undefined, 2_000)}
                </p>
                {hasLongOverview ? (
                  <button
                    type="button"
                    onClick={() => setOverviewOpen((value) => !value)}
                    aria-expanded={overviewOpen}
                    className="text-brand-800 mt-2 inline-flex min-h-12 items-center gap-1 font-medium"
                  >
                    {overviewOpen ? "소개 접기" : "소개 더 보기"}
                    {overviewOpen ? (
                      <ChevronUp className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                ) : null}
              </section>
            ) : null}

            <details className="group border-hairline bg-surface-soft mt-10 overflow-hidden rounded-xl border">
              <summary className="text-ink flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 font-semibold select-none [&::-webkit-details-marker]:hidden">
                <span>정보 출처와 기준일</span>
                <ChevronDown
                  className="text-steel h-5 w-5 shrink-0 transition-transform group-open:rotate-180"
                  aria-hidden="true"
                />
              </summary>
              <div className="border-hairline border-t bg-white px-4 pb-5">
                <dl className="divide-hairline divide-y">
                  <SourceRow label="정보 출처" value="ⓒ한국관광공사 관광정보·무장애 여행정보" />
                  <SourceRow label="관광정보 갱신" value={sourceDate ?? "확인할 수 없음"} />
                </dl>
                <p className="text-steel mt-2 text-sm leading-6">
                  시설 상태는 달라질 수 있습니다. 출입구, 엘리베이터, 화장실처럼 중요한 정보는 방문
                  전에 장소에 직접 확인해 주세요.
                </p>
              </div>
            </details>
          </div>
        </div>

        <footer className="border-hairline shrink-0 border-t bg-white p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-3 md:shadow-[0_-12px_28px_rgba(0,0,0,0.05)]">
          {shareStatus ? (
            <p className="text-steel mb-2 text-center text-sm" role="status">
              {shareStatus}
            </p>
          ) : null}
          <div
            className={`grid gap-2 ${phoneHref ? "grid-cols-[minmax(0,1fr)_auto_auto]" : "grid-cols-[minmax(0,1fr)_auto]"}`}
          >
            <Link
              href={mapHref}
              className="bg-brand-800 hover:bg-brand-900 flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-xl px-3 text-center leading-tight font-semibold whitespace-nowrap text-white transition-colors sm:px-4"
            >
              <span className="sm:hidden">지도 보기</span>
              <span className="hidden sm:inline">지도에서 보기</span>
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
            </Link>
            {phoneHref ? (
              <a
                href={phoneHref}
                className="border-hairline text-ink hover:bg-surface flex min-h-12 min-w-[4.5rem] items-center justify-center gap-1.5 rounded-xl border px-3 text-center leading-tight font-semibold transition-colors"
              >
                <Phone className="h-4 w-4" aria-hidden="true" />
                전화
              </a>
            ) : null}
            <button
              type="button"
              onClick={() => void sharePlace()}
              className="border-hairline text-ink hover:bg-surface flex min-h-12 min-w-[4.5rem] items-center justify-center gap-1.5 rounded-xl border px-3 text-center leading-tight font-semibold transition-colors"
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
              공유
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}

function NeedCheckRow({
  check,
  detail
}: {
  check: ReturnType<typeof getNeedEvidenceChecks>[number];
  detail?: string;
}) {
  const statusText =
    check.status === "unavailable" ? "제한 안내" : check.status === "unknown" ? "문의 권장" : null;
  const evidenceText = formatHomeDetailValue(detail ?? check.evidence[0]?.value, check.label);

  return (
    <div className="grid min-h-16 grid-cols-[1.5rem_minmax(0,1fr)] gap-3 p-4">
      <StatusIcon status={check.status} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-ink font-semibold">{check.label}</p>
          {statusText ? <p className="text-steel text-sm">{statusText}</p> : null}
        </div>
        {evidenceText ? (
          <p className="text-slate mt-1 line-clamp-3 text-sm leading-6">{evidenceText}</p>
        ) : (
          <p className="text-steel mt-1 text-sm leading-6">방문 전에 장소에 확인해 주세요.</p>
        )}
      </div>
    </div>
  );
}

function VisitInfoRow({
  icon: Icon,
  label,
  value,
  critical = false
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string | null;
  critical?: boolean;
}) {
  if (!value && !critical) return null;
  const displayValue =
    label === "이용요금" ? summarizeHomeFee(value) : formatHomeDetailValue(value, label);
  return (
    <div data-speakable className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-3 py-4">
      <span className="bg-surface text-steel grid h-10 w-10 place-items-center rounded-md">
        <Icon className="h-5 w-5" aria-hidden={true} />
      </span>
      <div className="min-w-0">
        <dt className="text-steel text-sm">{label}</dt>
        <dd className={`mt-1 leading-6 ${value ? "text-ink" : "text-gold-800"}`}>
          {displayValue || "방문 전 확인 필요"}
        </dd>
      </div>
    </div>
  );
}

function VisitResourceLink({
  href,
  label,
  description,
  placeTitle
}: {
  href: string;
  label: string;
  description: string;
  placeTitle: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={`${placeTitle} ${label} 새 창에서 열기`}
      className="border-hairline hover:bg-surface group flex min-h-16 items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors"
    >
      <span className="min-w-0">
        <span className="text-ink block font-semibold">{label}</span>
        <span className="text-steel mt-0.5 block text-sm leading-5">{description}</span>
      </span>
      <ExternalLink
        className="text-brand-700 h-5 w-5 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        aria-hidden="true"
      />
    </a>
  );
}

function AccessGroup({ group }: { group: HomeAccessibilityGroup }) {
  const Icon = GROUP_ICONS[group.id];
  const previewLabels = group.evidence.slice(0, 2).map((evidence) => evidence.label);
  const preview = `${previewLabels.join(" · ")}${group.evidence.length > previewLabels.length ? " 외" : ""}`;
  return (
    <details className="group/access border-hairline overflow-hidden rounded-2xl border bg-white">
      <summary
        id={`access-group-${group.id}`}
        className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 select-none [&::-webkit-details-marker]:hidden"
      >
        <span className="flex min-w-0 items-start gap-3">
          <span className="bg-brand-50 text-brand-800 grid h-10 w-10 shrink-0 place-items-center rounded-md">
            <Icon className="h-5 w-5" aria-hidden={true} />
          </span>
          <span className="min-w-0">
            <span className="text-ink block font-semibold">{group.label}</span>
            <span className="text-steel mt-0.5 line-clamp-1 block text-sm leading-5">
              {preview}
            </span>
          </span>
        </span>
        <ChevronDown
          className="text-steel h-5 w-5 shrink-0 transition-transform group-open/access:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <dl className="border-hairline divide-y border-t px-4">
        {group.evidence.map((evidence) => (
          <AccessDetail key={evidence.key} evidence={evidence} />
        ))}
      </dl>
    </details>
  );
}

function AccessDetail({ evidence }: { evidence: HomeAccessibilityEvidence }) {
  const status = getHomeEvidenceStatus(evidence);
  const statusLabel =
    status === "unavailable" ? "제한 안내" : status === "unknown" ? "문의 권장" : null;
  const displayValue = formatHomeDetailValue(evidence.value, evidence.label);

  return (
    <div className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-3 py-4">
      <StatusIcon status={status} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <dt className="text-ink font-semibold">{evidence.label}</dt>
          {statusLabel ? <dd className="text-steel text-sm">{statusLabel}</dd> : null}
        </div>
        <dd className="text-slate mt-1 leading-6">{displayValue}</dd>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: HomeEvidenceStatus }) {
  if (status === "available") {
    return <CircleCheck className="text-brand-700 mt-0.5 h-5 w-5" aria-hidden="true" />;
  }
  if (status === "unavailable") {
    return <CircleAlert className="mt-0.5 h-5 w-5 text-red-700" aria-hidden="true" />;
  }
  return <CircleHelp className="text-gold-700 mt-0.5 h-5 w-5" aria-hidden="true" />;
}

function SourceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 py-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-5">
      <dt className="text-steel text-sm">{label}</dt>
      <dd className="text-ink leading-6">{value}</dd>
    </div>
  );
}

function ConfirmedFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-hairline min-w-0 rounded-xl border bg-white px-3 py-2.5">
      <dt className="text-brand-800 text-xs font-semibold">{label}</dt>
      <dd className="text-slate mt-1 line-clamp-2 text-sm leading-5">
        {summarizeHomeEvidence(value)}
      </dd>
    </div>
  );
}

function SectionHeading({
  id,
  eyebrow,
  title,
  description
}: {
  id: string;
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div>
      {eyebrow ? <p className="text-brand-800 text-sm font-medium">{eyebrow}</p> : null}
      <h2 id={id} className={`text-ink text-2xl font-semibold ${eyebrow ? "mt-1" : ""}`}>
        {title}
      </h2>
      {description ? (
        <p className="text-steel mt-2 max-w-[62ch] text-sm leading-6">{description}</p>
      ) : null}
    </div>
  );
}
