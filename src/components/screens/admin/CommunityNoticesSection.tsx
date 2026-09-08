"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { validateTitleContent } from "@/lib/community/validation";
import { formatCommunityDate } from "@/lib/community/format";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { AdminFormShell, AdminListShell } from "./AdminListShell";
import { AdminSearchBar } from "./AdminSearchBar";
import { Select } from "@/components/ui/Select";
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

type CommunityNotice = {
  id: number;
  title: string;
  content: string;
  pinned: boolean;
  is_visible: boolean;
  published_at: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type FormState = {
  title: string;
  content: string;
  pinned: boolean;
  isVisible: boolean;
  publishedAt: string;
  sortOrder: number;
};

const EMPTY_FORM: FormState = {
  title: "",
  content: "",
  pinned: false,
  isVisible: true,
  publishedAt: "",
  sortOrder: 0
};

function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function fromLocalInputValue(v: string): string | null {
  if (!v.trim()) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function noticeToForm(notice: CommunityNotice): FormState {
  return {
    title: notice.title,
    content: notice.content,
    pinned: notice.pinned,
    isVisible: notice.is_visible,
    publishedAt: toLocalInputValue(notice.published_at),
    sortOrder: notice.sort_order
  };
}

export function CommunityNoticesSection() {
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

  const [items, setItems] = useState<CommunityNotice[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [searchInput, setSearchInput] = useState(q);
  /** 수정 모드에서 TipTap이 API 로드 완료 후에만 마운트되도록 */
  const [hydratedEditId, setHydratedEditId] = useState<number | null>(null);

  const visibleFilter = filterValue("visible");
  const pinnedFilter = filterValue("pinned");
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
      if (pinnedFilter !== "all") params.set("pinned", pinnedFilter);

      const res = await fetch(`/api/admin/community-notices?${params}`);
      const json = (await res.json().catch(() => ({}))) as {
        items?: CommunityNotice[];
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
  }, [page, q, visibleFilter, pinnedFilter]);

  const loadForEdit = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    setHydratedEditId(null);
    try {
      const res = await fetch(`/api/admin/community-notices?id=${id}`);
      const json = (await res.json().catch(() => ({}))) as {
        items?: CommunityNotice[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "공지를 불러오지 못했습니다.");
      const notice = json.items?.[0];
      if (!notice) throw new Error("공지를 찾을 수 없습니다.");
      setForm(noticeToForm(notice));
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

  const submit = async () => {
    const validationError = validateTitleContent(form.title, form.content);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);
    setSaving(true);
    setError(null);
    const payload = {
      title: form.title.trim(),
      content: form.content.trim(),
      pinned: form.pinned,
      is_visible: form.isVisible,
      published_at: fromLocalInputValue(form.publishedAt),
      sort_order: form.sortOrder
    };
    try {
      const res = await fetch("/api/admin/community-notices", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEditing ? { id: editingId, ...payload } : payload)
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "저장에 실패했습니다.");
      goList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const toggleVisible = async (notice: CommunityNotice) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/community-notices", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: notice.id, is_visible: !notice.is_visible })
      });
      if (!res.ok) throw new Error("변경 실패");
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "변경 실패");
    } finally {
      setSaving(false);
    }
  };

  const deleteNotice = async (id: number) => {
    if (!confirm("이 공지를 삭제할까요?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/community-notices?id=${id}`, { method: "DELETE" });
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
        title={isEditing ? "공지 수정" : "새 공지 작성"}
        subtitle={isEditing && editingId != null ? `번호 ${editingId}` : undefined}
        error={error}
        formError={formError}
        saving={saving || loading}
        onBack={goList}
        onSubmit={submit}
        submitLabel={isEditing ? "저장" : "등록"}
      >
        <div>
          <label className={fieldLabelClass}>제목</label>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="제목"
            className={fieldInputClass}
          />
        </div>
        {isCreating || (isEditing && hydratedEditId === editingId) ? (
          <RichTextEditor
            key={editingId ?? "new-notice"}
            value={form.content}
            onChange={(html) => setForm((f) => ({ ...f, content: html }))}
            uploadKind="notice"
            disabled={saving || loading}
          />
        ) : (
          <div className="border-hairline bg-surface-soft text-stone rounded-xl border px-3 py-10 text-center text-sm">
            본문 불러오는 중…
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-steel flex flex-col gap-1 text-sm">
            <span className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.pinned}
                onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))}
              />
              상단 고정
            </span>
            <span className="text-stone text-xs">
              선택 시 커뮤니티 공지 목록 맨 위에 핀으로 표시됩니다.
            </span>
          </label>
          <label className="text-steel flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isVisible}
              onChange={(e) => setForm((f) => ({ ...f, isVisible: e.target.checked }))}
            />
            커뮤니티 노출
          </label>
          <div>
            <label className={fieldLabelClass}>정렬 순서</label>
            <input
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) || 0 }))}
              className={fieldInputClass}
            />
          </div>
        </div>
        <div>
          <label className={fieldLabelClass}>게시일</label>
          <input
            type="datetime-local"
            value={form.publishedAt}
            onChange={(e) => setForm((f) => ({ ...f, publishedAt: e.target.value }))}
            className={fieldInputClass}
          />
        </div>
      </AdminFormShell>
    );
  }

  return (
    <AdminListShell
      title="공지 관리"
      subtitle="커뮤니티 공지사항 탭에 노출되는 게시글입니다."
      total={total}
      page={page}
      pageSize={DEFAULT_PAGE_SIZE}
      loading={loading}
      error={error}
      onPageChange={setPage}
      onCreateClick={goCreate}
      createLabel="새 공지"
      toolbar={
        <>
          <AdminSearchBar value={searchInput} onChange={setSearchInput} placeholder="제목 검색" />
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
          <Select
            value={pinnedFilter}
            onChange={(v) => setFilter("pinned", v === "all" ? null : v)}
            ariaLabel="고정 필터"
            className={`${fieldSelectClass} w-auto`}
            options={[
              { value: "all", label: "전체 고정" },
              { value: "pinned", label: "고정" },
              { value: "unpinned", label: "일반" }
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
              <th className={tableThClass}>고정</th>
              <th className={tableThClass}>노출</th>
              <th className={tableThClass}>게시일</th>
              <th className={tableThClass}>정렬</th>
              <th className={tableThClass}>
                <span className="sr-only">작업</span>
              </th>
            </tr>
          </thead>
          <tbody className={tableBodyClass}>
            {loading && (
              <tr>
                <td colSpan={7} className="text-stone px-4 py-8 text-center">
                  불러오는 중…
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={7} className="text-stone px-4 py-8 text-center">
                  등록된 공지가 없습니다.
                </td>
              </tr>
            )}
            {!loading &&
              items.map((notice) => (
                <tr key={notice.id} className={tableRowClass}>
                  <td className={`${tableTdCenterClass} text-stone whitespace-nowrap`}>
                    #{notice.id}
                  </td>
                  <td className="text-ink max-w-[20rem] min-w-[14rem] px-4 py-3.5 text-left font-semibold">
                    <span className="line-clamp-2 break-keep">{notice.title}</span>
                  </td>
                  <td className={`${tableTdCenterClass} whitespace-nowrap`}>
                    {notice.pinned ? <Badge tone="brand">고정</Badge> : "—"}
                  </td>
                  <td className={`${tableTdCenterClass} whitespace-nowrap`}>
                    {notice.is_visible ? (
                      <Badge tone="brand">노출</Badge>
                    ) : (
                      <Badge tone="neutral">숨김</Badge>
                    )}
                  </td>
                  <td className={`${tableTdCenterClass} text-stone text-xs whitespace-nowrap`}>
                    {formatCommunityDate(notice.published_at)}
                  </td>
                  <td className={`${tableTdCenterClass} text-stone`}>{notice.sort_order}</td>
                  <td className={tableTdCenterClass}>
                    <div className="flex flex-wrap justify-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={saving}
                        onClick={() => goEdit(notice.id)}
                      >
                        수정
                      </Button>
                      {notice.is_visible ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={saving}
                          onClick={() => toggleVisible(notice)}
                        >
                          숨기기
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="accent"
                          disabled={saving}
                          onClick={() => toggleVisible(notice)}
                        >
                          노출
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={saving}
                        onClick={() => deleteNotice(notice.id)}
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
