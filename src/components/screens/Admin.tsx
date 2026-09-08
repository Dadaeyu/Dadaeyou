"use client";

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import { useParams, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  MapPin,
  Route,
  Flag,
  Calendar,
  Database,
  AlertCircle,
  FileText,
  ChevronRight,
  ChevronDown,
  ShieldAlert,
  Megaphone,
  HelpCircle,
  Layers,
  type LucideIcon
} from "lucide-react";
import { DashboardSection } from "@/components/screens/admin/DashboardSection";
import { PlacesSection } from "@/components/screens/admin/PlacesSection";
import { CourseManagementSection } from "@/components/screens/admin/CourseManagementSection";
import { UsersSection } from "@/components/screens/admin/UsersSection";
import { BoardSection } from "@/components/screens/admin/BoardSection";
import { BoardPostsSection } from "@/components/screens/admin/BoardPostsSection";
import { ReportsSection } from "@/components/screens/admin/ReportsSection";
import { NoticesSection } from "@/components/screens/admin/NoticesSection";
import { CommunityNoticesSection } from "@/components/screens/admin/CommunityNoticesSection";
import { EventsSection } from "@/components/screens/admin/EventsSection";
import { FaqSection } from "@/components/screens/admin/FaqSection";
import { CommunityReportsSection } from "@/components/screens/admin/CommunityReportsSection";
import { TablePagination } from "@/components/screens/admin/TablePagination";

// ── 사이드바 메뉴 ─────────────────────────────────────────
// children이 있으면 트리메뉴(상위 클릭 시 펼침/접힘, 자체 페이지 없음), 없으면 단일 메뉴.
type LeafSection = { key: string; label: string; icon: LucideIcon };
type SidebarSection = LeafSection | (LeafSection & { children: { key: string; label: string }[] });

const SECTIONS: SidebarSection[] = [
  { key: "dashboard", label: "대시보드", icon: LayoutDashboard },
  { key: "users", label: "사용자 관리", icon: Users },
  { key: "notices", label: "팝업 관리", icon: AlertCircle },
  { key: "community-notices", label: "공지 관리", icon: Megaphone },
  { key: "events", label: "이벤트 관리", icon: Calendar },
  { key: "faq", label: "FAQ 관리", icon: HelpCircle },
  { key: "board-settings", label: "게시판 관리", icon: Layers },
  { key: "board-posts", label: "게시글 관리", icon: FileText },
  { key: "community-reports", label: "신고 관리", icon: ShieldAlert },
  {
    key: "place-group",
    label: "장소 관리",
    icon: MapPin,
    children: [
      { key: "places", label: "등록 장소 관리" },
      { key: "place-sync", label: "데이터 동기화" }
    ]
  },
  { key: "courses", label: "코스 관리", icon: Route },
  { key: "reports", label: "제보 확인", icon: Flag }
];

// ── 수동 API 동기화 — 완료(notDone=false)될 때까지 자동 반복 호출 ──
// 스케줄러는 서버가 스스로 체이닝하지만, 관리자 화면의 수동 버튼은 서버 체이닝이 없어서
// 한 번 클릭에 시간 예산(수십 초) 만큼만 처리하고 끝난다. 여기서 커서를 넘겨가며 클라이언트가
// notDone=false 가 될 때까지 반복 호출해, 버튼 한 번으로 해당 테이블 전체가 끝나게 한다.
function mergeSyncResult<T extends object>(prev: T | null, curr: T): T {
  if (!prev) return curr;
  const prevRecord = prev as Record<string, unknown>;
  const currRecord = curr as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...currRecord };
  for (const key of Object.keys(currRecord)) {
    const prevValue = prevRecord[key];
    const currValue = currRecord[key];
    if (typeof prevValue === "number" && typeof currValue === "number") {
      // total* 필드는 회차마다 "남은 대상 수"라 매번 줄어든다 — 최초 회차 값(전체 대상 수)을 유지.
      merged[key] = key.startsWith("total") ? prevValue : prevValue + currValue;
    } else if (Array.isArray(prevValue) && Array.isArray(currValue)) {
      // errors 같은 배열 필드는 회차별로 이어붙여 최근 20건까지 보여준다.
      merged[key] = [...prevValue, ...currValue].slice(0, 20);
    }
  }
  return merged as T;
}

// 개별 항목 실패(contentid별 API 오류) 목록 — errorCount > 0 인데 원인을 모르면 재시도해도
// 왜 계속 같은 건수만큼 실패하는지 알 길이 없어서, 서버가 돌려준 메시지를 그대로 보여준다.
function SyncErrorList({ errors }: { errors?: { contentid: number; message: string }[] }) {
  if (!errors || errors.length === 0) return null;
  return (
    <div className="border-gold-200 bg-gold-50 rounded-lg border p-4 text-sm">
      <p className="text-gold-800 mb-2 font-semibold">실패 목록 (최대 {errors.length}건 표시)</p>
      <ul className="text-gold-800 space-y-1">
        {errors.map((e, i) => (
          <li key={i} className="font-mono text-xs">
            contentid={e.contentid}: {e.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

async function runSyncUntilDone<T extends object>(
  target: string,
  onProgress: (result: T) => void
): Promise<T> {
  let cursor = 0;
  let acc: T | null = null;
  for (;;) {
    const url = `/api/place?target=${target}${cursor > 0 ? `&cursor=${cursor}` : ""}`;
    const res = await fetch(url, { method: "POST" });
    const json = (await res.json()) as T & {
      notDone?: boolean;
      nextCursor?: number;
      error?: string;
    };
    if (!res.ok) throw new Error(json?.error ?? `동기화 실패 (HTTP ${res.status})`);
    acc = mergeSyncResult(acc, json);
    onProgress(acc);
    if (!json.notDone) break;
    cursor = typeof json.nextCursor === "number" ? json.nextCursor : cursor;
  }
  return acc;
}

function resolveAdminSection(sectionParam: string | string[] | undefined): string {
  if (typeof sectionParam === "string" && sectionParam.length > 0) return sectionParam;
  if (Array.isArray(sectionParam) && sectionParam.length > 0) return sectionParam[0];
  return "dashboard";
}

// ── 레이아웃 ─────────────────────────────────────────────
export default function Admin() {
  const params = useParams();
  const section = resolveAdminSection(params.section as string | string[] | undefined);
  const router = useRouter();
  const [pendingReports, setPendingReports] = useState(0);

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const item of SECTIONS) {
      if ("children" in item && item.children.some((c) => c.key === section)) initial.add(item.key);
    }
    return initial;
  });

  // 트리메뉴 하위 항목으로 직접(주소 입력 등) 들어왔을 때도 상위가 자동으로 펼쳐지게.
  useEffect(() => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      for (const item of SECTIONS) {
        if ("children" in item && item.children.some((c) => c.key === section)) next.add(item.key);
      }
      return next;
    });
  }, [section]);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 모바일 탭바용 — 그룹 메뉴는 드롭다운으로 열고, 하나만 열려있게 한다.
  // 탭바 자체가 overflow-x-auto라 그 안에 absolute로 붙이면 overflow-y까지 auto로 취급돼(스펙상
  // 한 축이 visible이 아니면 다른 축도 auto가 됨) 패널이 잘려 안 보인다 — fixed + 좌표 계산으로 우회.
  const [mobileGroupOpen, setMobileGroupOpen] = useState<string | null>(null);
  const [mobileGroupPos, setMobileGroupPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const mobileGroupBtnRef = useRef<HTMLButtonElement>(null);
  const mobileTabsRef = useRef<HTMLDivElement>(null);

  // 선택된 탭이 스크롤 영역 밖에 있을 수 있으니(스크롤바도 숨겨서 위치 단서가 없다), 렌더링될
  // 때 항상 보이는 위치로 스크롤해 준다.
  useEffect(() => {
    mobileTabsRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [section]);
  const mobileGroupPanelRef = useRef<HTMLDivElement>(null);
  const toggleMobileGroup = (key: string, e: MouseEvent<HTMLButtonElement>) => {
    if (mobileGroupOpen === key) {
      setMobileGroupOpen(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setMobileGroupPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    setMobileGroupOpen(key);
  };
  useEffect(() => {
    if (!mobileGroupOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (mobileGroupBtnRef.current?.contains(target)) return;
      if (mobileGroupPanelRef.current?.contains(target)) return;
      setMobileGroupOpen(null);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [mobileGroupOpen]);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.pendingReports != null) setPendingReports(data.pendingReports);
      })
      .catch(() => {});
  }, []);

  return (
    <div
      className="-mx-4 -mt-6 -mb-24 flex md:-mx-6 md:-mb-6"
      style={{ minHeight: "calc(100vh - 64px)" }}
    >
      {/* 데스크톱 사이드바 */}
      <aside className="border-hairline-soft bg-background hidden w-56 shrink-0 flex-col gap-0.5 border-r px-3 py-6 md:flex">
        <p className="text-stone mb-2 px-3 text-[10px] font-bold tracking-widest uppercase">
          관리자
        </p>
        {SECTIONS.map((item) => {
          if ("children" in item) {
            const Icon = item.icon;
            const isExpanded = expandedGroups.has(item.key);
            const childActive = item.children.some((c) => c.key === section);
            return (
              <div key={item.key}>
                <button
                  onClick={() => toggleGroup(item.key)}
                  aria-expanded={isExpanded}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                    childActive
                      ? "text-navy-700"
                      : "text-steel hover:bg-surface-soft hover:text-ink"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${childActive ? "text-navy-600" : "text-stone"}`}
                  />
                  {item.label}
                  <ChevronRight
                    className={`text-stone ml-auto h-3.5 w-3.5 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                  />
                </button>
                {isExpanded && (
                  <div className="border-hairline-soft mt-0.5 ml-4 flex flex-col gap-0.5 border-l pl-3">
                    {item.children.map((child) => {
                      const active = section === child.key;
                      return (
                        <button
                          key={child.key}
                          onClick={() => router.push(`/admin/${child.key}`)}
                          className={`rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                            active
                              ? "bg-navy-50 text-navy-700"
                              : "text-steel hover:bg-surface-soft hover:text-ink"
                          }`}
                        >
                          {child.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          const { key, label, icon: Icon } = item;
          const active = section === key;
          return (
            <button
              key={key}
              onClick={() => router.push(key === "dashboard" ? "/admin" : `/admin/${key}`)}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                active
                  ? "bg-navy-50 text-navy-700"
                  : "text-steel hover:bg-surface-soft hover:text-ink"
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${active ? "text-navy-600" : "text-stone"}`} />
              {label}
              {key === "reports" && pendingReports > 0 && (
                <span className="bg-surface-soft text-error border-error/30 ml-auto rounded-full border px-1.5 py-0.5 text-[10px] font-bold">
                  {pendingReports}
                </span>
              )}
            </button>
          );
        })}
      </aside>

      {/* 메인 영역 */}
      <div className="bg-surface-soft/40 flex min-w-0 flex-1 flex-col">
        {/* 모바일 탭바 */}
        <div
          ref={mobileTabsRef}
          className="border-hairline-soft bg-background flex [scrollbar-width:none] gap-1 overflow-x-auto border-b px-4 py-2 [-ms-overflow-style:none] md:hidden [&::-webkit-scrollbar]:hidden"
        >
          {SECTIONS.map((item) => {
            if ("children" in item) {
              const Icon = item.icon;
              const isOpen = mobileGroupOpen === item.key;
              const childActive = item.children.some((c) => c.key === section);
              return (
                <button
                  key={item.key}
                  ref={isOpen ? mobileGroupBtnRef : undefined}
                  data-active={childActive || undefined}
                  onClick={(e) => toggleMobileGroup(item.key, e)}
                  aria-expanded={isOpen}
                  className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                    childActive ? "bg-navy-50 text-navy-700" : "text-steel hover:bg-surface-soft"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                  <ChevronDown
                    className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>
              );
            }

            const { key, label, icon: Icon } = item;
            const active = section === key;
            return (
              <button
                key={key}
                data-active={active || undefined}
                onClick={() => router.push(key === "dashboard" ? "/admin" : `/admin/${key}`)}
                className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                  active ? "bg-navy-50 text-navy-700" : "text-steel hover:bg-surface-soft"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
        </div>

        {/* 탭바가 overflow-x-auto라 그 안에서는 세로로 넘치는 패널이 잘리므로, fixed로 바깥에 띄운다. */}
        {mobileGroupOpen &&
          mobileGroupPos &&
          (() => {
            const group = SECTIONS.find(
              (item) => item.key === mobileGroupOpen && "children" in item
            );
            if (!group || !("children" in group)) return null;
            return (
              <div
                ref={mobileGroupPanelRef}
                style={{
                  top: mobileGroupPos.top,
                  left: mobileGroupPos.left,
                  width: mobileGroupPos.width
                }}
                className="border-hairline fixed z-30 overflow-hidden rounded-xl border bg-white py-1 shadow-lg md:hidden"
              >
                {group.children.map((child) => {
                  const active = section === child.key;
                  return (
                    <button
                      key={child.key}
                      onClick={() => {
                        router.push(`/admin/${child.key}`);
                        setMobileGroupOpen(null);
                      }}
                      className={`block w-full px-3 py-2 text-left text-xs font-semibold transition-colors ${
                        active ? "bg-navy-50 text-navy-700" : "text-steel hover:bg-surface-soft"
                      }`}
                    >
                      {child.label}
                    </button>
                  );
                })}
              </div>
            );
          })()}

        <div className="flex-1 overflow-auto px-4 pt-6 pb-24 md:px-8 md:py-6">
          {section === "dashboard" && <DashboardSection />}
          {section === "users" && <UsersSection />}
          {section === "board-settings" && <BoardSection />}
          {section === "board-posts" && <BoardPostsSection />}
          {section === "community-reports" && <CommunityReportsSection />}
          {section === "notices" && <NoticesSection />}
          {section === "community-notices" && <CommunityNoticesSection />}
          {section === "places" && <PlacesSection />}
          {section === "place-sync" && <PlaceSyncSection />}
          {section === "courses" && <CourseManagementSection />}
          {section === "reports" && <ReportsSection />}
          {section === "events" && <EventsSection />}
          {section === "faq" && <FaqSection />}
        </div>
      </div>
    </div>
  );
}

// ── 3. 장소 관리 ─────────────────────────────────────────
const DB_TABS = [
  { key: "place", label: "tb_place", desc: "장소 기본" },
  { key: "detail", label: "tb_place_detail", desc: "상세 정보" },
  { key: "detail_normalized", label: "tb_place_detail_normalized", desc: "상세 정보(정규화)" },
  { key: "barrierfree", label: "tb_place_barrierfree", desc: "무장애 정보" },
  { key: "bakery", label: "tb_place_bakery", desc: "제과점" },
  { key: "holiday", label: "tb_holiday", desc: "공휴일" }
] as const;
type DbTabKey = (typeof DB_TABS)[number]["key"];

// ── 각 테이블의 컬럼 헤더 (Supabase 실제 스키마 기준 하드코딩) ──
const PLACE_COLUMNS = [
  "place_id",
  "contentid",
  "title",
  "addr1",
  "addr2",
  "dong",
  "ldongregncd",
  "ldongsigngucd",
  "mapx",
  "mapy",
  "contenttypeid",
  "lclssystm1",
  "lclssystm2",
  "lclssystm3",
  "firstimage",
  "createdtime",
  "modifiedtime",
  "registtime",
  "updatetime",
  "delete_yn",
  "deletetime"
] as const;

const PLACE_DETAIL_COLUMNS = [
  "place_id",
  "contentid",
  "contenttypeid",
  "homepage",
  "tel",
  "overview",
  "accomcount",
  "chkbabycarriage",
  "expagerange",
  "infocenter",
  "opendate",
  "parking",
  "restdate",
  "useseason",
  "usetime",
  "accomcountculture",
  "chkbabycarriageculture",
  "discountinfo",
  "infocenterculture",
  "parkingculture",
  "parkingfee",
  "restdateculture",
  "usefee",
  "usetimeculture",
  "scale",
  "spendtime",
  "agelimit",
  "discountinfofestival",
  "eventenddate",
  "eventhomepage",
  "eventplace",
  "eventstartdate",
  "placeinfo",
  "playtime",
  "program",
  "spendtimefestival",
  "usetimefestival",
  "distance",
  "infocentertourcourse",
  "schedule",
  "taketime",
  "theme",
  "accomcountleports",
  "chkbabycarriageleports",
  "expagerangeleports",
  "infocenterleports",
  "openperiod",
  "parkingfeeleports",
  "parkingleports",
  "restdateleports",
  "scaleleports",
  "usefeeleports",
  "usetimeleports",
  "accomcountlodging",
  "checkintime",
  "checkouttime",
  "infocenterlodging",
  "parkinglodging",
  "pickup",
  "roomcount",
  "reservationlodging",
  "reservationurl",
  "roomtype",
  "scalelodging",
  "chkbabycarriageshopping",
  "infocentershopping",
  "opendateshopping",
  "opentime",
  "parkingshopping",
  "restdateshopping",
  "restroom",
  "saleitem",
  "saleitemcost",
  "scaleshopping",
  "shopguide",
  "discountinfofood",
  "firstmenu",
  "infocenterfood",
  "opendatefood",
  "opentimefood",
  "parkingfood",
  "restdatefood",
  "scalefood",
  "seat",
  "treatmenu",
  "createdtime",
  "modifiedtime",
  "registtime",
  "updatetime"
] as const;

const PLACE_BF_COLUMNS = [
  "place_id",
  "contentid",
  "braileblock",
  "helpdog",
  "guidehuman",
  "audioguide",
  "bigprint",
  "brailepromotion",
  "guidesystem",
  "blindhandicapetc",
  "signguide",
  "videoguide",
  "hearingroom",
  "hearinghandicapetc",
  "parking",
  "publictransport",
  "route",
  "wheelchair",
  "exit",
  "elevator",
  "restroom",
  "handicapetc",
  "stroller",
  "lactationroom",
  "babysparechair",
  "infantsfamilyetc",
  // 무장애 요약 플래그 (장애 유형별 편의 제공 여부)
  "has_blind",
  "has_deaf",
  "has_gait",
  "has_infant",
  "has_maternity",
  "has_senior",
  "registtime",
  "updatetime"
] as const;

const PLACE_BAKERY_COLUMNS = [
  "bakery_id",
  "bplc_nm",
  "road_nm_addr",
  "lotno_addr",
  "dat_updt_pnt",
  "dat_updt_se",
  "registtime",
  "updatetime",
  "delete_yn",
  "deletetime"
] as const;

function PlaceSyncSection() {
  const [dbTab, setDbTab] = useState<DbTabKey>("place");

  // 휠/네이티브 스크롤은 안 쓰고, 드래그(마우스든 터치든)로만 좌우로 넘긴다. 컨테이너에
  // touch-none 을 줘서 터치의 네이티브 스크롤 제스처를 끄고, 아래 pointer 핸들러가 마우스/터치
  // 구분 없이 직접 scrollLeft 를 옮긴다. 드래그 중 눌렀다 뗀 지점이 탭 버튼이면 click 이 그대로
  // 발동해 탭이 바뀌어버리므로, 일정 거리 이상 움직였을 때만 그 click 을 막는다.
  const tabDragRef = useRef({ down: false, startX: 0, startScrollLeft: 0, moved: false });

  const handleTabPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    tabDragRef.current = {
      down: true,
      startX: e.clientX,
      startScrollLeft: e.currentTarget.scrollLeft,
      moved: false
    };
    // 여기서 바로 캡처하면 그냥 클릭한 것도 컨테이너가 가져가버려 버튼의 click 이 안 먹는다.
    // 실제로 드래그가 감지됐을 때(handleTabPointerMove)만 캡처한다.
  };
  const handleTabPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = tabDragRef.current;
    if (!drag.down) return;
    const delta = e.clientX - drag.startX;
    if (Math.abs(delta) > 3 && !drag.moved) {
      drag.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (drag.moved) e.currentTarget.scrollLeft = drag.startScrollLeft - delta;
  };
  // pointerup/pointercancel에서만 드래그를 끝낸다 — pointerleave로도 끝내면, 실제 손가락
  // 드래그는 가로로만 움직이지 않고 위아래로도 살짝씩 벗어나기 마련이라 터치에서 드래그가
  // 계속 끊겨 아주 조금씩만 스크롤되는 문제가 있었다.
  const handleTabPointerUp = () => {
    tabDragRef.current.down = false;
  };
  const handleTabClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    if (tabDragRef.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      tabDragRef.current.moved = false;
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-ink text-xl font-semibold tracking-[-0.02em]">데이터 동기화</h1>
        <p className="text-stone mt-1 text-sm leading-5">
          정부 API로 동기화되는 원본 테이블을 조회하고, 필요하면 수동으로 동기화를 실행합니다.
        </p>
      </div>

      {/* Supabase 테이블 탭 */}
      <div>
        <div
          onPointerDown={handleTabPointerDown}
          onPointerMove={handleTabPointerMove}
          onPointerUp={handleTabPointerUp}
          onPointerCancel={handleTabPointerUp}
          onClickCapture={handleTabClickCapture}
          className="border-hairline-soft flex cursor-grab touch-none [scrollbar-width:none] gap-1 overflow-x-auto border-b select-none [-ms-overflow-style:none] active:cursor-grabbing [&::-webkit-scrollbar]:hidden"
        >
          {DB_TABS.map(({ key, label, desc }) => {
            const active = dbTab === key;
            return (
              <button
                key={key}
                onClick={() => setDbTab(key)}
                className={`flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors ${
                  active
                    ? "border-navy-600 text-navy-700"
                    : "text-steel hover:text-ink border-transparent"
                }`}
              >
                <Database className={`h-3.5 w-3.5 ${active ? "text-navy-600" : "text-stone"}`} />
                {label}
                <span className="text-stone text-xs font-normal">{desc}</span>
              </button>
            );
          })}
        </div>

        <div className="pt-2">
          {dbTab === "place" && <DbPlaceTable />}
          {dbTab === "detail" && <DbPlaceDetailTable />}
          {dbTab === "detail_normalized" && <DbPlaceDetailNormalizedTable />}
          {dbTab === "barrierfree" && <DbBarrierFreeTable />}
          {dbTab === "bakery" && <DbBakeryTable />}
          {dbTab === "holiday" && <DbHolidayTable />}
        </div>
      </div>
    </div>
  );
}

// ── 3-1. Supabase tb_place 조회 테이블 (페이징) ──────────
const DB_PLACE_PAGE_SIZE = 10;

function DbPlaceTable() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [page, setPage] = useState(0); // 0-based
  const [total, setTotal] = useState(0);

  // 동기화 상태
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState("");

  // targetPage(0-based) 페이지를 10개씩 조회
  const fetchRows = async (targetPage = 0) => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setStatus("error");
      setError(".env에 NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다.");
      return;
    }

    setStatus("loading");
    setError("");
    try {
      const { createClient } = await import("@/utils/supabase/client");
      const supabase = createClient();
      const from = targetPage * DB_PLACE_PAGE_SIZE;
      const to = from + DB_PLACE_PAGE_SIZE - 1;
      const { data, error, count } = await supabase
        .from("tb_place")
        .select("*", { count: "exact" })
        .order("place_id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      setRows((data ?? []) as Record<string, unknown>[]);
      setTotal(count ?? 0);
      setPage(targetPage);
      setStatus("success");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  };

  useEffect(() => {
    // 마운트 시 첫 페이지 조회 (initial fetch on mount)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRows(0);
  }, []);

  // areaBasedList2(대전, lDongRegnCd=30) 전체를 조회해 tb_place 에 upsert
  const runSync = async () => {
    setSyncing(true);
    setSyncError("");
    setSyncResult(null);
    try {
      await runSyncUntilDone<SyncResult>("place", setSyncResult);
      await fetchRows(0); // 동기화 후 첫 페이지부터 다시 조회
    } catch (e: unknown) {
      setSyncError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  };

  // 컬럼 헤더는 실제 스키마 기준으로 하드코딩 (데이터가 비어도 헤더 표시)
  const columns = PLACE_COLUMNS;
  const totalPages = Math.max(1, Math.ceil(total / DB_PLACE_PAGE_SIZE));
  const isLoading = status === "loading";

  const renderCell = (value: unknown) => {
    if (value === null || value === undefined) return <span className="text-stone">—</span>;
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  return (
    <div className="space-y-3 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Database className="text-navy-500 h-4 w-4" />
          <h2 className="text-ink font-bold">tb_place</h2>
          <code className="bg-surface text-steel rounded-full px-2 py-0.5 font-mono text-xs">
            Supabase
          </code>
          {status === "success" && <span className="text-stone text-sm">총 {total}건</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchRows(page)}
            disabled={isLoading || syncing}
            className="border-hairline text-steel hover:bg-surface-soft rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {isLoading ? "조회 중..." : "새로고침"}
          </button>
          <button
            onClick={runSync}
            disabled={syncing}
            className="bg-navy-600 hover:bg-navy-700 flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-50"
          >
            <Database className="h-3.5 w-3.5" />
            {syncing ? "동기화 중... (시간이 걸려요)" : "API 동기화"}
          </button>
        </div>
      </div>

      <p className="text-stone text-xs">
        “API 동기화”를 누르면 areaBasedList2(국문 관광정보, 대전 lDongRegnCd=30)를 전체 조회해
        tb_place에 contentid 기준으로 insert/update 합니다. API 결과에 없는 기존 장소는 삭제
        처리(delete_yn=Y)됩니다.
      </p>

      {/* 동기화 결과 / 에러 */}
      {syncResult && (
        <div className="border-brand-200 bg-brand-50 text-brand-800 rounded-lg border p-4 text-sm">
          {syncing ? "⏳ 동기화 진행 중" : "✓ 동기화 완료"} — 대전 관광정보 {syncResult.totalPlaces}
          건 중 {syncResult.fetched}건 저장(upsert {syncResult.upserted}), 삭제 처리{" "}
          {syncResult.deleted}건, 건너뜀 {syncResult.skipped}건
          {syncResult.errorCount > 0 && `, 실패 ${syncResult.errorCount}건`}
        </div>
      )}
      <SyncErrorList errors={syncResult?.errors} />
      {syncError && (
        <div className="border-gold-200 bg-gold-50 flex items-start gap-3 rounded-lg border p-4">
          <AlertCircle className="text-gold-500 mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-gold-800 text-sm whitespace-pre-wrap">{syncError}</p>
        </div>
      )}

      {status === "error" && (
        <div className="border-gold-200 bg-gold-50 flex items-start gap-3 rounded-lg border p-4">
          <AlertCircle className="text-gold-500 mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-gold-800 text-sm whitespace-pre-wrap">{error}</p>
        </div>
      )}

      {status !== "error" && (
        <div className="border-hairline-soft overflow-hidden rounded-lg border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-hairline-soft bg-surface-soft border-b">
                  {columns.map((c) => (
                    <th
                      key={c}
                      className="text-steel px-4 py-3 text-left text-xs font-bold whitespace-nowrap"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    className="border-hairline-soft hover:bg-surface-soft border-b transition-colors"
                  >
                    {columns.map((c) => (
                      <td key={c} className="text-steel px-4 py-3 whitespace-nowrap">
                        {renderCell(row[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isLoading && (
            <p className="text-steel animate-pulse py-8 text-center text-sm">
              Supabase에서 데이터를 불러오는 중...
            </p>
          )}
          {status === "success" && rows.length === 0 && (
            <p className="text-stone py-8 text-center text-sm">데이터가 없어요</p>
          )}

          {/* 페이지네이션 */}
          {status === "success" && total > 0 && (
            <TablePagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={DB_PLACE_PAGE_SIZE}
              disabled={isLoading}
              onChange={fetchRows}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── 3-2. Supabase tb_place_barrierfree 조회 + 동기화 ─────
const DB_BF_PAGE_SIZE = 10;

interface SyncResult {
  totalPlaces: number;
  fetched: number;
  upserted: number;
  deleted: number;
  skipped: number;
  errorCount: number;
  errors?: { contentid: number; message: string }[];
}

function DbBarrierFreeTable() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [page, setPage] = useState(0); // 0-based
  const [total, setTotal] = useState(0);

  // 동기화 상태
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState("");

  // targetPage(0-based) 페이지를 10개씩 조회
  const fetchRows = async (targetPage = 0) => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setStatus("error");
      setError(".env에 NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다.");
      return;
    }

    setStatus("loading");
    setError("");
    try {
      const { createClient } = await import("@/utils/supabase/client");
      const supabase = createClient();
      const from = targetPage * DB_BF_PAGE_SIZE;
      const to = from + DB_BF_PAGE_SIZE - 1;
      const { data, error, count } = await supabase
        .from("tb_place_barrierfree")
        .select("*", { count: "exact" })
        .order("place_id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      setRows((data ?? []) as Record<string, unknown>[]);
      setTotal(count ?? 0);
      setPage(targetPage);
      setStatus("success");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  };

  useEffect(() => {
    // 마운트 시 첫 페이지 조회 (initial fetch on mount)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRows(0);
  }, []);

  // tb_place 전체를 detailWithTour2 로 조회해 tb_place_barrierfree 에 upsert
  const runSync = async () => {
    setSyncing(true);
    setSyncError("");
    setSyncResult(null);
    try {
      await runSyncUntilDone<SyncResult>("barrierfree", setSyncResult);
      await fetchRows(0); // 동기화 후 첫 페이지부터 다시 조회
    } catch (e: unknown) {
      setSyncError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  };

  // 컬럼 헤더는 실제 스키마 기준으로 하드코딩 (데이터가 비어도 헤더 표시)
  const columns = PLACE_BF_COLUMNS;
  const totalPages = Math.max(1, Math.ceil(total / DB_BF_PAGE_SIZE));
  const isLoading = status === "loading";

  const renderCell = (value: unknown) => {
    if (value === null || value === undefined || value === "")
      return <span className="text-stone">—</span>;
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  return (
    <div className="space-y-3 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Database className="text-navy-500 h-4 w-4" />
          <h2 className="text-ink font-bold">tb_place_barrierfree</h2>
          <code className="bg-surface text-steel rounded-full px-2 py-0.5 font-mono text-xs">
            무장애 정보
          </code>
          {status === "success" && <span className="text-stone text-sm">총 {total}건</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchRows(page)}
            disabled={isLoading || syncing}
            className="border-hairline text-steel hover:bg-surface-soft rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {isLoading ? "조회 중..." : "새로고침"}
          </button>
          <button
            onClick={runSync}
            disabled={syncing}
            className="bg-navy-600 hover:bg-navy-700 flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-50"
          >
            <Database className="h-3.5 w-3.5" />
            {syncing ? "동기화 중... (시간이 걸려요)" : "API 동기화"}
          </button>
        </div>
      </div>

      <p className="text-stone text-xs">
        “API 동기화”를 누르면 tb_place의 모든 contentid로 detailWithTour2를 조회해
        tb_place_barrierfree에 insert/update 합니다. (무장애 정보가 없는 장소는 건너뛰고, 기존에
        저장돼 있었다면 삭제 처리됩니다)
      </p>

      {/* 동기화 결과 / 에러 */}
      {syncResult && (
        <div className="border-brand-200 bg-brand-50 text-brand-800 rounded-lg border p-4 text-sm">
          {syncing ? "⏳ 동기화 진행 중" : "✓ 동기화 완료"} — 대상 {syncResult.totalPlaces}건 중
          무장애 정보 {syncResult.fetched}건 저장(upsert {syncResult.upserted}), 삭제 처리{" "}
          {syncResult.deleted}건, 정보 없음 {syncResult.skipped}건
          {syncResult.errorCount > 0 && `, 실패 ${syncResult.errorCount}건`}
        </div>
      )}
      <SyncErrorList errors={syncResult?.errors} />
      {syncError && (
        <div className="border-gold-200 bg-gold-50 flex items-start gap-3 rounded-lg border p-4">
          <AlertCircle className="text-gold-500 mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-gold-800 text-sm whitespace-pre-wrap">{syncError}</p>
        </div>
      )}

      {status === "error" && (
        <div className="border-gold-200 bg-gold-50 flex items-start gap-3 rounded-lg border p-4">
          <AlertCircle className="text-gold-500 mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-gold-800 text-sm whitespace-pre-wrap">{error}</p>
        </div>
      )}

      {status !== "error" && (
        <div className="border-hairline-soft overflow-hidden rounded-lg border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-hairline-soft bg-surface-soft border-b">
                  {columns.map((c) => (
                    <th
                      key={c}
                      className="text-steel px-4 py-3 text-left text-xs font-bold whitespace-nowrap"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    className="border-hairline-soft hover:bg-surface-soft border-b transition-colors"
                  >
                    {columns.map((c) => (
                      <td
                        key={c}
                        className="text-steel max-w-xs truncate px-4 py-3 whitespace-nowrap"
                        title={typeof row[c] === "string" ? (row[c] as string) : undefined}
                      >
                        {renderCell(row[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isLoading && (
            <p className="text-steel animate-pulse py-8 text-center text-sm">
              Supabase에서 데이터를 불러오는 중...
            </p>
          )}
          {status === "success" && rows.length === 0 && (
            <p className="text-stone py-8 text-center text-sm">
              데이터가 없어요. “API 동기화”를 눌러 채워보세요.
            </p>
          )}

          {/* 페이지네이션 */}
          {status === "success" && total > 0 && (
            <TablePagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={DB_BF_PAGE_SIZE}
              disabled={isLoading}
              onChange={fetchRows}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── 3-2b. Supabase tb_place_bakery 조회 + 동기화 ─────────
const DB_BAKERY_PAGE_SIZE = 10;

interface BakerySyncResult {
  totalCount: number;
  fetched: number;
  inserted: number;
  updated: number;
  deleted: number;
  errorCount: number;
}

function DbBakeryTable() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [page, setPage] = useState(0); // 0-based
  const [total, setTotal] = useState(0);

  // 동기화 상태
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<BakerySyncResult | null>(null);
  const [syncError, setSyncError] = useState("");

  // targetPage(0-based) 페이지를 10개씩 조회
  const fetchRows = async (targetPage = 0) => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setStatus("error");
      setError(".env에 NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다.");
      return;
    }

    setStatus("loading");
    setError("");
    try {
      const { createClient } = await import("@/utils/supabase/client");
      const supabase = createClient();
      const from = targetPage * DB_BAKERY_PAGE_SIZE;
      const to = from + DB_BAKERY_PAGE_SIZE - 1;
      const { data, error, count } = await supabase
        .from("tb_place_bakery")
        .select("*", { count: "exact" })
        .order("bakery_id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      setRows((data ?? []) as Record<string, unknown>[]);
      setTotal(count ?? 0);
      setPage(targetPage);
      setStatus("success");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  };

  useEffect(() => {
    // 마운트 시 첫 페이지 조회 (initial fetch on mount)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRows(0);
  }, []);

  // 제과점영업 조회서비스에서 대전광역시 데이터를 조회해 tb_place_bakery 와 동기화
  const runSync = async () => {
    setSyncing(true);
    setSyncError("");
    setSyncResult(null);
    try {
      await runSyncUntilDone<BakerySyncResult>("bakery", setSyncResult);
      await fetchRows(0); // 동기화 후 첫 페이지부터 다시 조회
    } catch (e: unknown) {
      setSyncError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  };

  // 컬럼 헤더는 실제 스키마 기준으로 하드코딩 (데이터가 비어도 헤더 표시)
  const columns = PLACE_BAKERY_COLUMNS;
  const totalPages = Math.max(1, Math.ceil(total / DB_BAKERY_PAGE_SIZE));
  const isLoading = status === "loading";

  const renderCell = (value: unknown) => {
    if (value === null || value === undefined || value === "")
      return <span className="text-stone">—</span>;
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  return (
    <div className="space-y-3 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Database className="text-navy-500 h-4 w-4" />
          <h2 className="text-ink font-bold">tb_place_bakery</h2>
          <code className="bg-surface text-steel rounded-full px-2 py-0.5 font-mono text-xs">
            제과점
          </code>
          {status === "success" && <span className="text-stone text-sm">총 {total}건</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchRows(page)}
            disabled={isLoading || syncing}
            className="border-hairline text-steel hover:bg-surface-soft rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {isLoading ? "조회 중..." : "새로고침"}
          </button>
          <button
            onClick={runSync}
            disabled={syncing}
            className="bg-navy-600 hover:bg-navy-700 flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-50"
          >
            <Database className="h-3.5 w-3.5" />
            {syncing ? "동기화 중... (시간이 걸려요)" : "API 동기화"}
          </button>
        </div>
      </div>

      <p className="text-stone text-xs">
        “API 동기화”를 누르면 행정안전부 제과점영업 조회서비스에서 대전광역시(영업 중) 제과점을 전부
        조회해 tb_place_bakery와 동기화합니다. (상호명 기준으로 신규는 insert, 주소·갱신정보가 바뀐
        곳은 update, API에 없는 곳은 삭제됩니다)
      </p>

      {/* 동기화 결과 / 에러 */}
      {syncResult && (
        <div className="border-brand-200 bg-brand-50 text-brand-800 rounded-lg border p-4 text-sm">
          {syncing ? "⏳ 동기화 진행 중" : "✓ 동기화 완료"} — 대상 {syncResult.totalCount}건 조회(
          {syncResult.fetched}건), 신규 {syncResult.inserted}건, 수정 {syncResult.updated}건, 삭제
          처리 {syncResult.deleted}건
          {syncResult.errorCount > 0 && `, 실패 ${syncResult.errorCount}건`}
        </div>
      )}
      {syncError && (
        <div className="border-gold-200 bg-gold-50 flex items-start gap-3 rounded-lg border p-4">
          <AlertCircle className="text-gold-500 mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-gold-800 text-sm whitespace-pre-wrap">{syncError}</p>
        </div>
      )}

      {status === "error" && (
        <div className="border-gold-200 bg-gold-50 flex items-start gap-3 rounded-lg border p-4">
          <AlertCircle className="text-gold-500 mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-gold-800 text-sm whitespace-pre-wrap">{error}</p>
        </div>
      )}

      {status !== "error" && (
        <div className="border-hairline-soft overflow-hidden rounded-lg border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-hairline-soft bg-surface-soft border-b">
                  {columns.map((c) => (
                    <th
                      key={c}
                      className="text-steel px-4 py-3 text-left text-xs font-bold whitespace-nowrap"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    className="border-hairline-soft hover:bg-surface-soft border-b transition-colors"
                  >
                    {columns.map((c) => (
                      <td
                        key={c}
                        className="text-steel max-w-xs truncate px-4 py-3 whitespace-nowrap"
                        title={typeof row[c] === "string" ? (row[c] as string) : undefined}
                      >
                        {renderCell(row[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isLoading && (
            <p className="text-steel animate-pulse py-8 text-center text-sm">
              Supabase에서 데이터를 불러오는 중...
            </p>
          )}
          {status === "success" && rows.length === 0 && (
            <p className="text-stone py-8 text-center text-sm">
              데이터가 없어요. “API 동기화”를 눌러 채워보세요.
            </p>
          )}

          {/* 페이지네이션 */}
          {status === "success" && total > 0 && (
            <TablePagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={DB_BAKERY_PAGE_SIZE}
              disabled={isLoading}
              onChange={fetchRows}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── 3-3. Supabase tb_place_detail 조회 + 동기화 ──────────
const DB_DETAIL_PAGE_SIZE = 10;

function DbPlaceDetailTable() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [page, setPage] = useState(0); // 0-based
  const [total, setTotal] = useState(0);

  // 동기화 상태
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncError, setSyncError] = useState("");

  // targetPage(0-based) 페이지를 10개씩 조회
  const fetchRows = async (targetPage = 0) => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setStatus("error");
      setError(".env에 NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다.");
      return;
    }

    setStatus("loading");
    setError("");
    try {
      const { createClient } = await import("@/utils/supabase/client");
      const supabase = createClient();
      const from = targetPage * DB_DETAIL_PAGE_SIZE;
      const to = from + DB_DETAIL_PAGE_SIZE - 1;
      const { data, error, count } = await supabase
        .from("tb_place_detail")
        .select("*", { count: "exact" })
        .order("place_id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      setRows((data ?? []) as Record<string, unknown>[]);
      setTotal(count ?? 0);
      setPage(targetPage);
      setStatus("success");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  };

  useEffect(() => {
    // 마운트 시 첫 페이지 조회 (initial fetch on mount)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRows(0);
  }, []);

  // tb_place 전체를 detailCommon2 + detailIntro2 로 조회해 tb_place_detail 에 upsert
  const runSync = async () => {
    setSyncing(true);
    setSyncError("");
    setSyncResult(null);
    try {
      await runSyncUntilDone<SyncResult>("detail", setSyncResult);
      await fetchRows(0); // 동기화 후 첫 페이지부터 다시 조회
    } catch (e: unknown) {
      setSyncError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  };

  // 컬럼 헤더는 실제 스키마 기준으로 하드코딩 (데이터가 비어도 헤더 표시)
  const columns = PLACE_DETAIL_COLUMNS;
  const totalPages = Math.max(1, Math.ceil(total / DB_DETAIL_PAGE_SIZE));
  const isLoading = status === "loading";

  const renderCell = (value: unknown) => {
    if (value === null || value === undefined || value === "")
      return <span className="text-stone">—</span>;
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  return (
    <div className="space-y-3 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Database className="text-navy-500 h-4 w-4" />
          <h2 className="text-ink font-bold">tb_place_detail</h2>
          <code className="bg-surface text-steel rounded-full px-2 py-0.5 font-mono text-xs">
            상세 정보
          </code>
          {status === "success" && <span className="text-stone text-sm">총 {total}건</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchRows(page)}
            disabled={isLoading || syncing}
            className="border-hairline text-steel hover:bg-surface-soft rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {isLoading ? "조회 중..." : "새로고침"}
          </button>
          <button
            onClick={runSync}
            disabled={syncing}
            className="bg-navy-600 hover:bg-navy-700 flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-50"
          >
            <Database className="h-3.5 w-3.5" />
            {syncing ? "동기화 중... (시간이 걸려요)" : "API 동기화"}
          </button>
        </div>
      </div>

      <p className="text-stone text-xs">
        “API 동기화”를 누르면 tb_place의 모든 contentid로 detailCommon2(공통정보) +
        detailIntro2(소개정보)를 조회해 tb_place_detail에 insert/update 합니다. 상세정보가 조회되지
        않은 기존 행은 삭제 처리됩니다.
      </p>

      {/* 동기화 결과 / 에러 */}
      {syncResult && (
        <div className="border-brand-200 bg-brand-50 text-brand-800 rounded-lg border p-4 text-sm">
          {syncing ? "⏳ 동기화 진행 중" : "✓ 동기화 완료"} — 대상 {syncResult.totalPlaces}건 중{" "}
          {syncResult.fetched}건 저장(upsert {syncResult.upserted}), 삭제 처리 {syncResult.deleted}
          건, 정보 없음 {syncResult.skipped}건
          {syncResult.errorCount > 0 && `, 실패 ${syncResult.errorCount}건`}
        </div>
      )}
      <SyncErrorList errors={syncResult?.errors} />
      {syncError && (
        <div className="border-gold-200 bg-gold-50 flex items-start gap-3 rounded-lg border p-4">
          <AlertCircle className="text-gold-500 mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-gold-800 text-sm whitespace-pre-wrap">{syncError}</p>
        </div>
      )}

      {status === "error" && (
        <div className="border-gold-200 bg-gold-50 flex items-start gap-3 rounded-lg border p-4">
          <AlertCircle className="text-gold-500 mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-gold-800 text-sm whitespace-pre-wrap">{error}</p>
        </div>
      )}

      {status !== "error" && (
        <div className="border-hairline-soft overflow-hidden rounded-lg border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-hairline-soft bg-surface-soft border-b">
                  {columns.map((c) => (
                    <th
                      key={c}
                      className="text-steel px-4 py-3 text-left text-xs font-bold whitespace-nowrap"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    className="border-hairline-soft hover:bg-surface-soft border-b transition-colors"
                  >
                    {columns.map((c) => (
                      <td
                        key={c}
                        className="text-steel max-w-xs truncate px-4 py-3 whitespace-nowrap"
                        title={typeof row[c] === "string" ? (row[c] as string) : undefined}
                      >
                        {renderCell(row[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isLoading && (
            <p className="text-steel animate-pulse py-8 text-center text-sm">
              Supabase에서 데이터를 불러오는 중...
            </p>
          )}
          {status === "success" && rows.length === 0 && (
            <p className="text-stone py-8 text-center text-sm">
              데이터가 없어요. “API 동기화”를 눌러 채워보세요.
            </p>
          )}

          {/* 페이지네이션 */}
          {status === "success" && total > 0 && (
            <TablePagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={DB_DETAIL_PAGE_SIZE}
              disabled={isLoading}
              onChange={fetchRows}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── 3-4. Supabase tb_place_detail_normalized 조회 (조회 전용) ─────
const PLACE_DETAIL_NORMALIZED_COLUMNS = [
  "place_id",
  "contentid",
  "contenttypeid",
  "homepage",
  "tel",
  "overview",
  "accomcount",
  "accommin",
  "accommax",
  "scale",
  "agerange",
  "agemin",
  "agemax",
  "openperiod",
  "opendate",
  "useseason",
  "usetime",
  "eventstartdate",
  "eventenddate",
  "checkintime",
  "checkouttime",
  "spendtime",
  "restdate",
  "closed_weekdays",
  "closed_holiday",
  "has_irregular_closing",
  "schedule",
  "infocenter",
  "usefee",
  "discountinfo",
  "parking",
  "parkingfee",
  "chkbabycarriage",
  "eventhomepage",
  "eventplace",
  "placeinfo",
  "program",
  "distance",
  "theme",
  "pickup",
  "roomcount",
  "reservationlodging",
  "reservationurl",
  "roomtype",
  "restroom",
  "saleitem",
  "saleitemcost",
  "shopguide",
  "firstmenu",
  "seat",
  "treatmenu",
  "createdtime",
  "modifiedtime",
  "registtime",
  "updatetime"
] as const;

function DbPlaceDetailNormalizedTable() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [page, setPage] = useState(0); // 0-based
  const [total, setTotal] = useState(0);

  // 정규화(tb_place_detail → tb_place_detail_normalized 복사) 상태
  const [normalizing, setNormalizing] = useState(false);
  const [normResult, setNormResult] = useState<SyncResult | null>(null);
  const [normError, setNormError] = useState("");

  // targetPage(0-based) 페이지를 10개씩 조회
  const fetchRows = async (targetPage = 0) => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setStatus("error");
      setError(".env에 NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다.");
      return;
    }

    setStatus("loading");
    setError("");
    try {
      const { createClient } = await import("@/utils/supabase/client");
      const supabase = createClient();
      const from = targetPage * DB_DETAIL_PAGE_SIZE;
      const to = from + DB_DETAIL_PAGE_SIZE - 1;
      const { data, error, count } = await supabase
        .from("tb_place_detail_normalized")
        .select("*", { count: "exact" })
        .order("place_id", { ascending: true })
        .range(from, to);
      if (error) throw error;
      setRows((data ?? []) as Record<string, unknown>[]);
      setTotal(count ?? 0);
      setPage(targetPage);
      setStatus("success");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  };

  useEffect(() => {
    // 마운트 시 첫 페이지 조회 (initial fetch on mount)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRows(0);
  }, []);

  // "정규화" — tb_place_detail 의 동일 컬럼 데이터를 tb_place_detail_normalized 로 복사(upsert)
  const runNormalize = async () => {
    setNormalizing(true);
    setNormError("");
    setNormResult(null);
    try {
      await runSyncUntilDone<SyncResult>("normalize", setNormResult);
      await fetchRows(0); // 정규화 후 첫 페이지부터 다시 조회
    } catch (e: unknown) {
      setNormError(e instanceof Error ? e.message : String(e));
    } finally {
      setNormalizing(false);
    }
  };

  // 컬럼 헤더는 실제 스키마 기준으로 하드코딩 (데이터가 비어도 헤더 표시)
  const columns = PLACE_DETAIL_NORMALIZED_COLUMNS;
  const totalPages = Math.max(1, Math.ceil(total / DB_DETAIL_PAGE_SIZE));
  const isLoading = status === "loading";

  const renderCell = (value: unknown) => {
    if (value === null || value === undefined || value === "")
      return <span className="text-stone">—</span>;
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  return (
    <div className="space-y-3 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Database className="text-navy-500 h-4 w-4" />
          <h2 className="text-ink font-bold">tb_place_detail_normalized</h2>
          <code className="bg-surface text-steel rounded-full px-2 py-0.5 font-mono text-xs">
            상세 정보(정규화)
          </code>
          {status === "success" && <span className="text-stone text-sm">총 {total}건</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchRows(page)}
            disabled={isLoading || normalizing}
            className="border-hairline text-steel hover:bg-surface-soft rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {isLoading ? "조회 중..." : "새로고침"}
          </button>
          <button
            onClick={runNormalize}
            disabled={normalizing}
            className="bg-navy-600 hover:bg-navy-700 flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-50"
          >
            <Database className="h-3.5 w-3.5" />
            {normalizing ? "정규화 중..." : "정규화"}
          </button>
        </div>
      </div>

      <p className="text-stone text-xs">
        “정규화”를 누르면 tb_place_detail 의 동일 컬럼 데이터를 tb_place_detail_normalized 로
        복사(place_id 기준 insert/update)합니다. accommin·accommax·agerange·agemin·agemax 등 신규
        컬럼은 아직 채우지 않습니다.
      </p>

      {/* 정규화 결과 / 에러 */}
      {normResult && (
        <div className="border-brand-200 bg-brand-50 text-brand-800 rounded-lg border p-4 text-sm">
          {normalizing ? "⏳ 정규화 진행 중" : "✓ 정규화 완료"} — tb_place_detail{" "}
          {normResult.totalPlaces}건에서 {normResult.upserted}건 복사(upsert)
        </div>
      )}
      {normError && (
        <div className="border-gold-200 bg-gold-50 flex items-start gap-3 rounded-lg border p-4">
          <AlertCircle className="text-gold-500 mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-gold-800 text-sm whitespace-pre-wrap">{normError}</p>
        </div>
      )}

      {status === "error" && (
        <div className="border-gold-200 bg-gold-50 flex items-start gap-3 rounded-lg border p-4">
          <AlertCircle className="text-gold-500 mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-gold-800 text-sm whitespace-pre-wrap">{error}</p>
        </div>
      )}

      {status !== "error" && (
        <div className="border-hairline-soft overflow-hidden rounded-lg border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-hairline-soft bg-surface-soft border-b">
                  {columns.map((c) => (
                    <th
                      key={c}
                      className="text-steel px-4 py-3 text-left text-xs font-bold whitespace-nowrap"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    className="border-hairline-soft hover:bg-surface-soft border-b transition-colors"
                  >
                    {columns.map((c) => (
                      <td
                        key={c}
                        className="text-steel max-w-xs truncate px-4 py-3 whitespace-nowrap"
                        title={typeof row[c] === "string" ? (row[c] as string) : undefined}
                      >
                        {renderCell(row[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isLoading && (
            <p className="text-steel animate-pulse py-8 text-center text-sm">
              Supabase에서 데이터를 불러오는 중...
            </p>
          )}
          {status === "success" && rows.length === 0 && (
            <p className="text-stone py-8 text-center text-sm">데이터가 없어요.</p>
          )}

          {/* 페이지네이션 */}
          {status === "success" && total > 0 && (
            <TablePagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={DB_DETAIL_PAGE_SIZE}
              disabled={isLoading}
              onChange={fetchRows}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── 3-5. Supabase tb_holiday 조회 + 동기화 ───────────────
const DB_HOLIDAY_PAGE_SIZE = 10;

const HOLIDAY_COLUMNS = [
  "holiday_id",
  "datename",
  "locdate",
  "seq",
  "datekind",
  "isholiday",
  "registtime",
  "updatetime"
] as const;

interface HolidaySyncResult {
  year: string;
  fetched: number;
  deleted: number;
  inserted: number;
}

function DbHolidayTable() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState("");
  const [page, setPage] = useState(0); // 0-based
  const [total, setTotal] = useState(0);

  // 동기화 상태
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<HolidaySyncResult | null>(null);
  const [syncError, setSyncError] = useState("");

  // targetPage(0-based) 페이지를 10개씩 조회
  const fetchRows = async (targetPage = 0) => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setStatus("error");
      setError(".env에 NEXT_PUBLIC_SUPABASE_URL이 설정되지 않았습니다.");
      return;
    }

    setStatus("loading");
    setError("");
    try {
      const { createClient } = await import("@/utils/supabase/client");
      const supabase = createClient();
      const from = targetPage * DB_HOLIDAY_PAGE_SIZE;
      const to = from + DB_HOLIDAY_PAGE_SIZE - 1;
      const { data, error, count } = await supabase
        .from("tb_holiday")
        .select("*", { count: "exact" })
        .order("locdate", { ascending: true })
        .order("seq", { ascending: true })
        .range(from, to);
      if (error) throw error;
      setRows((data ?? []) as Record<string, unknown>[]);
      setTotal(count ?? 0);
      setPage(targetPage);
      setStatus("success");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  };

  useEffect(() => {
    // 마운트 시 첫 페이지 조회 (initial fetch on mount)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRows(0);
  }, []);

  // 특일 정보 API(공휴일 정보조회)를 올해 연도로 조회해 tb_holiday 의 올해 데이터를
  // 전부 지우고 다시 insert 한다. (upsert 아님)
  const runSync = async () => {
    setSyncing(true);
    setSyncError("");
    setSyncResult(null);
    try {
      const res = await fetch("/api/holiday", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? `동기화 실패 (HTTP ${res.status})`);
      setSyncResult(json as HolidaySyncResult);
      await fetchRows(0); // 동기화 후 첫 페이지부터 다시 조회
    } catch (e: unknown) {
      setSyncError(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  };

  // 컬럼 헤더는 실제 스키마 기준으로 하드코딩 (데이터가 비어도 헤더 표시)
  const columns = HOLIDAY_COLUMNS;
  const totalPages = Math.max(1, Math.ceil(total / DB_HOLIDAY_PAGE_SIZE));
  const isLoading = status === "loading";

  const renderCell = (value: unknown) => {
    if (value === null || value === undefined || value === "")
      return <span className="text-stone">—</span>;
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  };

  return (
    <div className="space-y-3 pt-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Database className="text-navy-500 h-4 w-4" />
          <h2 className="text-ink font-bold">tb_holiday</h2>
          <code className="bg-surface text-steel rounded-full px-2 py-0.5 font-mono text-xs">
            공휴일
          </code>
          {status === "success" && <span className="text-stone text-sm">총 {total}건</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchRows(page)}
            disabled={isLoading || syncing}
            className="border-hairline text-steel hover:bg-surface-soft rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {isLoading ? "조회 중..." : "새로고침"}
          </button>
          <button
            onClick={runSync}
            disabled={syncing}
            className="bg-navy-600 hover:bg-navy-700 flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-50"
          >
            <Database className="h-3.5 w-3.5" />
            {syncing ? "동기화 중..." : "API 동기화"}
          </button>
        </div>
      </div>

      <p className="text-stone text-xs">
        “API 동기화”를 누르면 한국천문연구원 특일 정보(공휴일 정보조회)를 올해 연도로 조회해,
        tb_holiday의 올해 데이터를 전부 삭제한 뒤 조회 결과를 다시 insert 합니다.
      </p>

      {/* 동기화 결과 / 에러 */}
      {syncResult && (
        <div className="border-brand-200 bg-brand-50 text-brand-800 rounded-lg border p-4 text-sm">
          ✓ 동기화 완료 — {syncResult.year}년 {syncResult.fetched}건 조회, 기존 {syncResult.deleted}
          건 삭제 후 {syncResult.inserted}건 저장
        </div>
      )}
      {syncError && (
        <div className="border-gold-200 bg-gold-50 flex items-start gap-3 rounded-lg border p-4">
          <AlertCircle className="text-gold-500 mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-gold-800 text-sm whitespace-pre-wrap">{syncError}</p>
        </div>
      )}

      {status === "error" && (
        <div className="border-gold-200 bg-gold-50 flex items-start gap-3 rounded-lg border p-4">
          <AlertCircle className="text-gold-500 mt-0.5 h-4 w-4 shrink-0" />
          <p className="text-gold-800 text-sm whitespace-pre-wrap">{error}</p>
        </div>
      )}

      {status !== "error" && (
        <div className="border-hairline-soft overflow-hidden rounded-lg border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-hairline-soft bg-surface-soft border-b">
                  {columns.map((c) => (
                    <th
                      key={c}
                      className="text-steel px-4 py-3 text-left text-xs font-bold whitespace-nowrap"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    className="border-hairline-soft hover:bg-surface-soft border-b transition-colors"
                  >
                    {columns.map((c) => (
                      <td
                        key={c}
                        className="text-steel max-w-xs truncate px-4 py-3 whitespace-nowrap"
                        title={typeof row[c] === "string" ? (row[c] as string) : undefined}
                      >
                        {renderCell(row[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isLoading && (
            <p className="text-steel animate-pulse py-8 text-center text-sm">
              Supabase에서 데이터를 불러오는 중...
            </p>
          )}
          {status === "success" && rows.length === 0 && (
            <p className="text-stone py-8 text-center text-sm">
              데이터가 없어요. “API 동기화”를 눌러 채워보세요.
            </p>
          )}

          {/* 페이지네이션 */}
          {status === "success" && total > 0 && (
            <TablePagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={DB_HOLIDAY_PAGE_SIZE}
              disabled={isLoading}
              onChange={fetchRows}
            />
          )}
        </div>
      )}
    </div>
  );
}
