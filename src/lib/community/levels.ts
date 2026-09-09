import type { LucideIcon } from "lucide-react";
import { Footprints, MapPinned, Users, Compass, ShieldCheck } from "lucide-react";

/** 커뮤니티 등급 1~5 (DB calc_community_level과 동일) */
export const COMMUNITY_MAX_LEVEL = 5;

/** 다음 레벨에 필요한 누적 점수 (index 0 = Lv2 임계) */
export const COMMUNITY_LEVEL_THRESHOLDS = [50, 200, 500, 1000] as const;

/** 대전 마스코트 계열 커뮤니티 호칭 (Lv1 꿈누리 → Lv5 꿈돌이) */
export const COMMUNITY_LEVEL_LABELS: Record<number, string> = {
  1: "꿈누리",
  2: "꿀결이",
  3: "꿈빛이",
  4: "꿈순이",
  5: "꿈돌이"
};

export type CommunityLevelMeta = {
  label: string;
  Icon: LucideIcon;
  /** 뱃지 컨테이너 클래스 */
  chipClass: string;
  iconClass: string;
};

export const COMMUNITY_LEVEL_META: Record<number, CommunityLevelMeta> = {
  1: {
    label: COMMUNITY_LEVEL_LABELS[1],
    Icon: Footprints,
    chipClass: "bg-surface-soft text-ink ring-hairline",
    iconClass: "text-steel"
  },
  2: {
    label: COMMUNITY_LEVEL_LABELS[2],
    Icon: MapPinned,
    chipClass: "bg-brand-50 text-ink ring-brand-200/70",
    iconClass: "text-brand-600"
  },
  3: {
    label: COMMUNITY_LEVEL_LABELS[3],
    Icon: Users,
    chipClass: "bg-navy-50 text-ink ring-navy-200/70",
    iconClass: "text-navy-600"
  },
  4: {
    label: COMMUNITY_LEVEL_LABELS[4],
    Icon: Compass,
    chipClass: "bg-brand-100 text-ink ring-brand-300/60",
    iconClass: "text-brand-600"
  },
  5: {
    label: COMMUNITY_LEVEL_LABELS[5],
    Icon: ShieldCheck,
    // navy-900/gold-700 은 다크에서 재정의되지 않아 글자가 사라짐 → ink + 밝은 골드 아이콘
    chipClass: "bg-gold-100 text-ink ring-gold-400/80",
    iconClass: "text-gold-500"
  }
};

export function clampCommunityLevel(level: number | null | undefined): number {
  const n = typeof level === "number" && Number.isFinite(level) ? Math.floor(level) : 1;
  return Math.min(COMMUNITY_MAX_LEVEL, Math.max(1, n));
}

export function getCommunityLevelMeta(level: number | null | undefined): CommunityLevelMeta {
  const lv = clampCommunityLevel(level);
  return COMMUNITY_LEVEL_META[lv] ?? COMMUNITY_LEVEL_META[1];
}

/** 화면 읽어주기(TTS)용 등급 표기: "레벨 1 꿈누리" */
export function formatCommunityLevelForSpeech(level: number | null | undefined): string {
  const lv = clampCommunityLevel(level);
  return `레벨 ${lv} ${COMMUNITY_LEVEL_LABELS[lv] ?? COMMUNITY_LEVEL_LABELS[1]}`;
}

export function nextLevelThreshold(level: number | null | undefined): number | null {
  const lv = clampCommunityLevel(level);
  if (lv >= COMMUNITY_MAX_LEVEL) return null;
  return COMMUNITY_LEVEL_THRESHOLDS[lv - 1] ?? null;
}
