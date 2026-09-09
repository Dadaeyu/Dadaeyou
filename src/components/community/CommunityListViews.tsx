"use client";

import Link from "next/link";
import { Calendar, ChevronDown, Eye, Heart, HelpCircle, MessageCircle, Pin } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { CommunityLevelBadge } from "@/components/community/CommunityLevelBadge";
import {
  formatCommunityDate,
  formatCommunityDateTime,
  formatCommunityDateTimeForSpeech
} from "@/lib/community/format";

export type BoardListItem = {
  id: number;
  board_nm: string;
  title: string;
  writer_nm: string;
  writer_community_level?: number;
  view_cnt: number;
  like_cnt: number;
  comment_cnt: number;
  notice_yn: boolean;
  created_at: string;
};

export type NoticeListItem = {
  id: number;
  title: string;
  pinned: boolean;
  published_at: string;
};

export type EventListItem = {
  id: number;
  title: string;
  summary: string;
  emoji: string;
  badge_label: string;
  badge_color: string;
  cover_gradient: string;
  cover_image_url: string | null;
  period_label: string;
};

export type FaqListItem = {
  id: number;
  question: string;
  answer?: string;
};

function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="divide-hairline-soft border-hairline-soft divide-y overflow-hidden rounded-2xl border">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="animate-pulse px-4 py-4 sm:px-5">
          <div className="bg-surface h-4 w-2/3 rounded" />
          <div className="bg-surface mt-2 h-3 w-1/3 rounded" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="border-hairline-soft bg-surface-soft rounded-2xl border px-5 py-12 text-center">
      <p className="text-stone text-sm">{message}</p>
    </div>
  );
}

export function CommunityBoardList({
  loading,
  items
}: {
  loading: boolean;
  items: BoardListItem[];
}) {
  if (loading) return <ListSkeleton rows={5} />;
  if (items.length === 0) return <EmptyState message="아직 게시글이 없어요." />;

  return (
    <div className="border-hairline-soft divide-hairline-soft divide-y overflow-hidden rounded-2xl border">
      {items.map((post) => (
        <Link
          key={post.id}
          href={`/community/${post.id}`}
          aria-label={`${post.notice_yn ? "공지" : post.board_nm} 게시글, ${post.title}, 작성자 ${post.writer_nm}, ${formatCommunityDateTimeForSpeech(post.created_at)} 작성, 조회 ${post.view_cnt}회, 좋아요 ${post.like_cnt}개, 댓글 ${post.comment_cnt}개`}
          data-speak-group="true"
          className={`hover:bg-brand-50/40 dark:hover:bg-surface group relative block px-4 py-4 transition-colors sm:px-5 ${
            post.notice_yn ? "bg-brand-50/30 dark:bg-brand-50/40" : "bg-background"
          }`}
        >
          {post.notice_yn ? (
            <span className="bg-brand-500 absolute top-0 bottom-0 left-0 w-1" aria-hidden />
          ) : null}
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <Badge tone={post.notice_yn ? "warn" : "tag"} shape="tag" className="shrink-0">
                  {post.notice_yn ? "공지" : post.board_nm}
                </Badge>
                <h3
                  aria-hidden="true"
                  className="text-ink group-hover:text-brand-800 min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.01em] sm:text-base"
                >
                  {post.title}
                </h3>
              </div>
              <div className="text-stone flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm">
                <CommunityLevelBadge
                  level={post.writer_community_level}
                  size="sm"
                  showLabel={false}
                />
                <span className="text-steel">{post.writer_nm}</span>
                <span aria-hidden>·</span>
                <span>{formatCommunityDateTime(post.created_at)}</span>
              </div>
            </div>
            <div className="text-stone flex shrink-0 flex-col items-end gap-1.5 text-[11px] sm:flex-row sm:items-center sm:gap-3 sm:text-xs">
              <span className="inline-flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" aria-hidden />
                {post.view_cnt}
              </span>
              <span className="inline-flex items-center gap-1">
                <Heart className="h-3.5 w-3.5" aria-hidden />
                {post.like_cnt}
              </span>
              <span className="inline-flex items-center gap-1">
                <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                {post.comment_cnt}
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function CommunityNoticeList({
  loading,
  items
}: {
  loading: boolean;
  items: NoticeListItem[];
}) {
  if (loading) return <ListSkeleton rows={4} />;
  if (items.length === 0) return <EmptyState message="등록된 공지가 없습니다." />;

  return (
    <div className="border-hairline-soft divide-hairline-soft divide-y overflow-hidden rounded-2xl border">
      {items.map((notice) => (
        <Link
          key={notice.id}
          href={`/community/notice/${notice.id}`}
          className={`hover:bg-surface-soft block px-4 py-4 transition-colors sm:px-5 ${
            notice.pinned ? "bg-brand-50/50 dark:bg-brand-50/40" : "bg-background"
          }`}
        >
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {notice.pinned ? (
                  <span className="text-brand-700 inline-flex items-center gap-1 text-xs font-semibold">
                    <Pin className="h-3.5 w-3.5" aria-hidden />
                    고정
                  </span>
                ) : null}
                <h3 className="text-ink min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.01em] sm:text-base">
                  {notice.title}
                </h3>
              </div>
              <p className="text-stone mt-1 text-xs sm:text-sm">
                {formatCommunityDate(notice.published_at)}
              </p>
            </div>
            <ChevronDown
              className="text-stone h-4 w-4 shrink-0 -rotate-90 opacity-60"
              aria-hidden
            />
          </div>
        </Link>
      ))}
    </div>
  );
}

export function CommunityEventGrid({
  loading,
  items
}: {
  loading: boolean;
  items: EventListItem[];
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="bg-surface aspect-[4/5] animate-pulse rounded-[1.5rem] sm:min-h-[20rem]"
          />
        ))}
      </div>
    );
  }
  if (items.length === 0) return <EmptyState message="등록된 이벤트가 없습니다." />;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {items.map((ev) => (
        <Link
          key={ev.id}
          href={`/community/event/${ev.id}`}
          className="group focus-visible:outline-brand-600 relative flex aspect-[4/5] overflow-hidden rounded-[1.5rem] focus-visible:outline-2 focus-visible:outline-offset-4 sm:aspect-auto sm:min-h-[20rem]"
        >
          <div
            className={`absolute inset-0 bg-gradient-to-br ${ev.cover_gradient || "from-brand-700 to-navy-800"}`}
          />
          {ev.cover_image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ev.cover_image_url}
              alt=""
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04] motion-reduce:transform-none"
            />
          ) : (
            <span className="absolute inset-0 grid place-items-center text-6xl opacity-90">
              {ev.emoji || "🎉"}
            </span>
          )}
          <span className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,24,22,0.08)_20%,rgba(8,24,22,0.82)_100%)]" />
          <span className="absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-2 p-4">
            {ev.badge_label ? (
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold backdrop-blur-sm ${ev.badge_color || "bg-brand-300/90 text-brand-900"}`}
              >
                {ev.badge_label}
              </span>
            ) : (
              <span />
            )}
            {ev.period_label ? (
              <span className="text-fixed-white border-fixed-white/25 inline-flex max-w-[60%] items-center gap-1 rounded-full border bg-black/25 px-2.5 py-1 text-[11px] font-medium backdrop-blur-md">
                <Calendar className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{ev.period_label}</span>
              </span>
            ) : null}
          </span>
          <span className="text-fixed-white absolute inset-x-0 bottom-0 p-4 sm:p-5">
            <span className="block text-xl leading-tight font-semibold tracking-[-0.02em] [overflow-wrap:anywhere]">
              {ev.title}
            </span>
            {ev.summary ? (
              <span className="text-fixed-white/80 mt-2 line-clamp-2 text-sm">{ev.summary}</span>
            ) : null}
          </span>
        </Link>
      ))}
    </div>
  );
}

export function CommunityFaqAccordion({
  loading,
  items,
  openId,
  onToggle
}: {
  loading: boolean;
  items: FaqListItem[];
  openId: number | null;
  onToggle: (id: number) => void;
}) {
  if (loading) return <ListSkeleton rows={5} />;
  if (items.length === 0) return <EmptyState message="등록된 FAQ가 없습니다." />;

  return (
    <div className="space-y-4">
      <div className="border-hairline-soft bg-surface-soft divide-hairline-soft divide-y overflow-hidden rounded-2xl border">
        {items.map((faq) => {
          const open = openId === faq.id;
          const hasAnswer = Boolean(faq.answer?.trim());
          return (
            <div key={faq.id} className="bg-background">
              {hasAnswer ? (
                <button
                  type="button"
                  onClick={() => onToggle(faq.id)}
                  className="hover:bg-surface-soft flex w-full items-start gap-3 px-4 py-4 text-left transition-colors sm:px-5"
                  aria-expanded={open}
                >
                  <span className="text-brand-600 mt-0.5 text-sm font-bold">Q</span>
                  <span className="text-ink min-w-0 flex-1 text-sm font-semibold sm:text-[15px]">
                    {faq.question}
                  </span>
                  <ChevronDown
                    className={`text-stone mt-0.5 h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
                    aria-hidden
                  />
                </button>
              ) : (
                <Link
                  href={`/community/faq/${faq.id}`}
                  className="hover:bg-surface-soft flex w-full items-start gap-3 px-4 py-4 transition-colors sm:px-5"
                >
                  <span className="text-brand-600 mt-0.5 text-sm font-bold">Q</span>
                  <span className="text-ink min-w-0 flex-1 text-sm font-semibold sm:text-[15px]">
                    {faq.question}
                  </span>
                  <ChevronDown
                    className="text-stone mt-0.5 h-4 w-4 shrink-0 -rotate-90"
                    aria-hidden
                  />
                </Link>
              )}
              {hasAnswer && open ? (
                <div className="border-hairline-soft from-surface-soft/80 to-background border-t bg-gradient-to-b px-4 pt-3 pb-4 text-sm leading-relaxed sm:px-5">
                  <div className="flex gap-3">
                    <span className="text-brand-600 mt-0.5 shrink-0 text-sm font-bold">A</span>
                    <div className="text-steel min-w-0 flex-1 whitespace-pre-wrap">
                      {faq.answer}
                    </div>
                  </div>
                  <Link
                    href={`/community/faq/${faq.id}`}
                    className="text-brand-600 hover:text-brand-700 mt-3 inline-flex pl-5 text-xs font-semibold sm:pl-6"
                  >
                    자세히 보기
                  </Link>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <p className="text-stone flex items-center justify-center gap-2 text-sm">
        <HelpCircle className="h-4 w-4" aria-hidden />
        원하는 답변이 없나요? 게시판에 질문을 남겨 주세요.
      </p>
    </div>
  );
}
