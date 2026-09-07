"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { validateEventFields } from "@/lib/community/validation";
import {
  DEFAULT_EVENT_BADGE_COLOR,
  EVENT_BADGE_COLOR_PRESETS,
  resolveEventBadgeColor,
  validateEventPeriod
} from "@/lib/community/event-ui";
import { resolveEndAfterStartChange } from "@/lib/date-range";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { Select } from "@/components/ui/Select";
import { DateField } from "@/components/ui/DateField";
import { AdminFormShell, AdminListShell } from "./AdminListShell";
import { AdminSearchBar } from "./AdminSearchBar";
import { useAdminListMode } from "./useAdminListMode";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import {
  fieldInputClass,
  fieldLabelClass,
  fieldSelectClass,
  tableBodyClass,
  tableClass,
  tableHeadRowClass,
  tableRowClass,
  tableTdCenterClass,
  tableThClass,
  tableThLeftClass,
  tableWrapClass
} from "./adminUi";

type CommunityEvent = {
  id: number;
  title: string;
  summary: string;
  content: string;
  emoji: string;
  badge_label: string;
  badge_color: string;
  cover_gradient: string;
  cover_image_url: string | null;
  period_label: string;
  period_start: string | null;
  period_end: string | null;
  is_visible: boolean;
  sort_order: number;
};

type FormState = {
  title: string;
  summary: string;
  content: string;
  badgeLabel: string;
  badgeColor: string;
  coverImageUrl: string | null;
  periodStart: string;
  periodEnd: string;
  isVisible: boolean;
  sortOrder: number;
};

const EMPTY_FORM: FormState = {
  title: "",
  summary: "",
  content: "",
  badgeLabel: "",
  badgeColor: DEFAULT_EVENT_BADGE_COLOR,
  coverImageUrl: null,
  periodStart: "",
  periodEnd: "",
  isVisible: true,
  sortOrder: 0
};

const sideLabelClass = "text-stone shrink-0 text-xs font-semibold sm:mb-0 sm:w-24";

function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  // timestamptz/date → YYYY-MM-DD
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return m ? m[1] : "";
}

function eventToForm(event: CommunityEvent): FormState {
  return {
    title: event.title,
    summary: event.summary,
    content: event.content,
    badgeLabel: event.badge_label,
    badgeColor: resolveEventBadgeColor(event.badge_color),
    coverImageUrl: event.cover_image_url,
    periodStart: toDateInputValue(event.period_start),
    periodEnd: toDateInputValue(event.period_end),
    isVisible: event.is_visible,
    sortOrder: event.sort_order
  };
}

export function EventsSection() {
  const {
    mode,
    editingId,
    page,
    q,
    goList,
    goCreate,
    goEdit,
    setPage,
    setQuery,
    setFilter,
    filterValue
  } = useAdminListMode();

  const [items, setItems] = useState<CommunityEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [searchInput, setSearchInput] = useState(q);
  const [hydratedEditId, setHydratedEditId] = useState<number | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const visibleFilter = filterValue("visible");
  const isEditing = mode === "edit" && editingId !== null;
  const isCreating = mode === "create";

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page + 1));
      params.set("pageSize", String(DEFAULT_PAGE_SIZE));
      if (q) params.set("q", q);
      if (visibleFilter !== "all") params.set("visible", visibleFilter);

      const res = await fetch(`/api/admin/community-events?${params}`);
      const json = (await res.json().catch(() => ({}))) as {
        items?: CommunityEvent[];
        total?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "목록을 불러오지 못했습니다.");
      setItems(json.items ?? []);
      setTotal(json.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "목록 로드 실패");
    } finally {
      setLoading(false);
    }
  }, [page, q, visibleFilter]);

  const loadForEdit = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    setHydratedEditId(null);
    try {
      const res = await fetch(`/api/admin/community-events?id=${id}`);
      const json = (await res.json().catch(() => ({}))) as {
        items?: CommunityEvent[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "이벤트를 불러오지 못했습니다.");
      const event = json.items?.[0];
      if (!event) throw new Error("이벤트를 찾을 수 없습니다.");
      setForm(eventToForm(event));
      setHydratedEditId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "로드 실패");
      setHydratedEditId(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode === "list") queueMicrotask(() => void loadList());
  }, [mode, loadList]);

  useEffect(() => {
    queueMicrotask(() => {
      if (isEditing && editingId) {
        setForm(EMPTY_FORM);
        void loadForEdit(editingId);
      } else if (isCreating) {
        setForm(EMPTY_FORM);
        setHydratedEditId(null);
      } else {
        setHydratedEditId(null);
      }
    });
  }, [isEditing, isCreating, editingId, loadForEdit]);

  useEffect(() => {
    if (mode !== "list") return;
    if (searchInput === q) return;
    const t = setTimeout(() => setQuery(searchInput), 300);
    return () => clearTimeout(t);
  }, [mode, searchInput, q, setQuery]);

  useEffect(() => {
    if (mode !== "list") return;
    queueMicrotask(() => setSearchInput(q));
  }, [mode, q]);

  const uploadCover = async (file: File) => {
    setUploadingCover(true);
    setFormError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("kind", "event");
      const res = await fetch("/api/admin/community-media", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? "썸네일 업로드에 실패했습니다.");
      setForm((f) => ({ ...f, coverImageUrl: json.url! }));
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "썸네일 업로드 실패");
    } finally {
      setUploadingCover(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  };

  const submit = async () => {
    const validationError = validateEventFields({
      title: form.title,
      summary: form.summary,
      content: form.content
    });
    if (validationError) {
      setFormError(validationError);
      return;
    }
    const periodError = validateEventPeriod(form.periodStart || null, form.periodEnd || null);
    if (periodError) {
      setFormError(periodError);
      return;
    }
    setFormError(null);
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      summary: form.summary.trim(),
      content: form.content.trim(),
      badge_label: form.badgeLabel.trim(),
      badge_color: form.badgeColor.trim(),
      cover_image_url: form.coverImageUrl,
      period_start: form.periodStart || null,
      period_end: form.periodEnd || null,
      is_visible: form.isVisible,
      sort_order: form.sortOrder
    };
    try {
      const res = await fetch("/api/admin/community-events", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEditing ? { id: editingId, ...payload } : payload)
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        warning?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "저장에 실패했습니다.");
      if (json.warning) {
        setError(json.warning);
      }
      goList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const toggleVisible = async (event: CommunityEvent) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/community-events", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: event.id, is_visible: !event.is_visible })
      });
      if (!res.ok) throw new Error("변경 실패");
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "변경 실패");
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = async (id: number) => {
    if (!confirm("이 이벤트를 삭제할까요?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/community-events?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("삭제 실패");
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setSaving(false);
    }
  };

  if (isCreating || isEditing) {
    return (
      <AdminFormShell
        title={isEditing ? "이벤트 수정" : "새 이벤트 등록"}
        subtitle={isEditing && editingId != null ? `번호 ${editingId}` : undefined}
        error={error}
        formError={formError}
        saving={saving || loading || uploadingCover}
        onBack={goList}
        onSubmit={submit}
        submitLabel={isEditing ? "저장" : "등록"}
      >
        <div className="space-y-2">
          <p className={fieldLabelClass}>썸네일</p>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadCover(file);
            }}
          />
          {form.coverImageUrl ? (
            <div className="border-hairline relative overflow-hidden rounded-xl border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={form.coverImageUrl}
                alt="이벤트 썸네일 미리보기"
                className="h-48 w-full object-cover sm:h-56"
              />
              <div className="absolute top-2 right-2 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={uploadingCover || saving}
                  onClick={() => coverInputRef.current?.click()}
                >
                  변경
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="bg-background/90"
                  disabled={uploadingCover || saving}
                  onClick={() => setForm((f) => ({ ...f, coverImageUrl: null }))}
                  aria-label="썸네일 제거"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={uploadingCover || saving}
              onClick={() => coverInputRef.current?.click()}
              className="border-hairline hover:bg-surface-soft bg-background text-steel flex h-48 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed transition-colors sm:h-56"
            >
              <ImagePlus className="h-8 w-8" />
              <span className="text-sm font-medium">
                {uploadingCover ? "업로드 중…" : "사진 등록 (미리보기)"}
              </span>
              <span className="text-stone text-xs">JPEG, PNG, WebP, GIF · 최대 5MB</span>
            </button>
          )}
        </div>

        {/* 제목 */}
        <label className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <span className={sideLabelClass}>제목</span>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="이벤트 제목을 입력하세요"
            className={fieldInputClass}
          />
        </label>

        {/* 요약 */}
        <label className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
          <span className={`${sideLabelClass} sm:pt-2.5`}>요약</span>
          <textarea
            value={form.summary}
            onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
            placeholder="목록 카드에 보여줄 짧은 설명"
            rows={2}
            className={fieldInputClass}
          />
        </label>

        {/* 기간 */}
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <span className={sideLabelClass}>기간</span>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <DateField
              value={form.periodStart}
              max={form.periodEnd || undefined}
              onChange={(periodStart) => {
                setForm((f) => ({
                  ...f,
                  periodStart,
                  periodEnd: resolveEndAfterStartChange(periodStart, f.periodEnd, true)
                }));
                setFormError(null);
              }}
              className="min-w-[10.5rem] flex-1"
              ariaLabel="시작일"
            />
            <span className="text-stone text-sm">~</span>
            <DateField
              value={form.periodEnd}
              min={form.periodStart || undefined}
              onChange={(periodEnd) => {
                if (form.periodStart && periodEnd && periodEnd < form.periodStart) {
                  setFormError("종료일은 시작일 이후여야 합니다.");
                  return;
                }
                setForm((f) => ({ ...f, periodEnd }));
                setFormError(null);
              }}
              className="min-w-[10.5rem] flex-1"
              ariaLabel="종료일"
            />
          </div>
        </div>

        {/* 배지 */}
        <label className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <span className={sideLabelClass}>배지 문구</span>
          <input
            value={form.badgeLabel}
            onChange={(e) => setForm((f) => ({ ...f, badgeLabel: e.target.value }))}
            placeholder="예: 진행중, 마감임박 (비우면 배지 없음)"
            className={fieldInputClass}
          />
        </label>

        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <span className={sideLabelClass}>배지 색상</span>
          <div className="flex flex-wrap gap-2">
            {EVENT_BADGE_COLOR_PRESETS.map((preset) => {
              const selected = form.badgeColor === preset.className;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, badgeColor: preset.className }))}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-shadow ${preset.className} ${
                    selected
                      ? "ring-brand-500 ring-2 ring-offset-2"
                      : "opacity-80 hover:opacity-100"
                  }`}
                  aria-pressed={selected}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 본문 */}
        <div className="space-y-1.5">
          <p className={fieldLabelClass}>본문</p>
          {isCreating || (isEditing && hydratedEditId === editingId) ? (
            <RichTextEditor
              key={editingId ?? "new-event"}
              value={form.content}
              onChange={(html) => setForm((f) => ({ ...f, content: html }))}
              uploadKind="event"
              disabled={saving || loading}
            />
          ) : (
            <div className="border-hairline text-stone rounded-lg border px-3 py-10 text-center text-sm">
              본문 불러오는 중…
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="text-steel flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isVisible}
              onChange={(e) => setForm((f) => ({ ...f, isVisible: e.target.checked }))}
            />
            커뮤니티 노출
          </label>
          <label className="text-steel flex items-center gap-2 text-sm">
            <span className="font-semibold">정렬</span>
            <input
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) || 0 }))}
              className="border-hairline w-20 rounded-lg border px-2 py-1 text-sm"
            />
          </label>
        </div>
      </AdminFormShell>
    );
  }

  return (
    <AdminListShell
      title="이벤트 관리"
      subtitle="커뮤니티 이벤트 탭 카드와 상세 페이지 내용을 관리합니다."
      total={total}
      page={page}
      pageSize={DEFAULT_PAGE_SIZE}
      loading={loading}
      error={error}
      onPageChange={setPage}
      onCreateClick={goCreate}
      createLabel="새 이벤트"
      toolbar={
        <>
          <AdminSearchBar
            value={searchInput}
            onChange={setSearchInput}
            placeholder="제목·요약 검색"
          />
          <Select
            value={visibleFilter}
            onChange={(v) => setFilter("visible", v === "all" ? null : v)}
            ariaLabel="노출 필터"
            className={`${fieldSelectClass} w-auto`}
            options={[
              { value: "all", label: "전체 노출" },
              { value: "visible", label: "노출" },
              { value: "hidden", label: "숨김" }
            ]}
          />
        </>
      }
    >
      <div className={tableWrapClass}>
        <table className={tableClass}>
          <thead>
            <tr className={tableHeadRowClass}>
              <th className={tableThClass}>ID</th>
              <th className={`${tableThLeftClass} min-w-[14rem]`}>제목</th>
              <th className={tableThClass}>배지</th>
              <th className={tableThClass}>기간</th>
              <th className={tableThClass}>노출</th>
              <th className={tableThClass}>
                <span className="sr-only">작업</span>
              </th>
            </tr>
          </thead>
          <tbody className={tableBodyClass}>
            {loading && (
              <tr>
                <td colSpan={6} className="text-stone px-4 py-8 text-center">
                  불러오는 중…
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="text-stone px-4 py-8 text-center">
                  등록된 이벤트가 없습니다.
                </td>
              </tr>
            )}
            {!loading &&
              items.map((event) => (
                <tr key={event.id} className={tableRowClass}>
                  <td className={`${tableTdCenterClass} text-stone whitespace-nowrap`}>
                    #{event.id}
                  </td>
                  <td className="text-ink max-w-[20rem] min-w-[14rem] px-4 py-3.5 text-left">
                    <div className="flex items-center gap-2">
                      {event.cover_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={event.cover_image_url}
                          alt=""
                          className="h-8 w-12 shrink-0 rounded object-cover"
                        />
                      ) : null}
                      <span className="line-clamp-2 font-semibold break-keep">{event.title}</span>
                    </div>
                  </td>
                  <td className={`${tableTdCenterClass} whitespace-nowrap`}>
                    {event.badge_label ? (
                      <Badge tone="custom" className={resolveEventBadgeColor(event.badge_color)}>
                        {event.badge_label}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={`${tableTdCenterClass} text-stone text-xs`}>
                    {event.period_label || "—"}
                  </td>
                  <td className={`${tableTdCenterClass} whitespace-nowrap`}>
                    {event.is_visible ? (
                      <Badge tone="brand">노출</Badge>
                    ) : (
                      <Badge tone="neutral">숨김</Badge>
                    )}
                  </td>
                  <td className={tableTdCenterClass}>
                    <div className="flex flex-wrap justify-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={saving}
                        onClick={() => goEdit(event.id)}
                      >
                        수정
                      </Button>
                      {event.is_visible ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={saving}
                          onClick={() => toggleVisible(event)}
                        >
                          숨기기
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="accent"
                          disabled={saving}
                          onClick={() => toggleVisible(event)}
                        >
                          노출
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={saving}
                        onClick={() => deleteEvent(event.id)}
                      >
                        삭제
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </AdminListShell>
  );
}
