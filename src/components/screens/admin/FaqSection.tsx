"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { validateFaqFields } from "@/lib/community/validation";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { AdminFormShell, AdminListShell } from "./AdminListShell";
import { AdminSearchBar } from "./AdminSearchBar";
import { Select } from "@/components/ui/Select";
import { useAdminListMode } from "./useAdminListMode";
import {
  fieldInputClass,
  fieldLabelClass,
  fieldSelectClass,
  fieldTextareaClass,
  tableBodyClass,
  tableClass,
  tableHeadRowClass,
  tableRowClass,
  tableTdCenterClass,
  tableThClass,
  tableThLeftClass,
  tableWrapClass
} from "./adminUi";

type CommunityFaq = {
  id: number;
  question: string;
  answer: string;
  is_visible: boolean;
  sort_order: number;
};

type FormState = {
  question: string;
  answer: string;
  isVisible: boolean;
  sortOrder: number;
};

const EMPTY_FORM: FormState = {
  question: "",
  answer: "",
  isVisible: true,
  sortOrder: 0
};

function faqToForm(faq: CommunityFaq): FormState {
  return {
    question: faq.question,
    answer: faq.answer,
    isVisible: faq.is_visible,
    sortOrder: faq.sort_order
  };
}

export function FaqSection() {
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

  const [items, setItems] = useState<CommunityFaq[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [searchInput, setSearchInput] = useState(q);

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

      const res = await fetch(`/api/admin/community-faq?${params}`);
      const json = (await res.json().catch(() => ({}))) as {
        items?: CommunityFaq[];
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
    try {
      const res = await fetch(`/api/admin/community-faq?id=${id}`);
      const json = (await res.json().catch(() => ({}))) as {
        items?: CommunityFaq[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "FAQ를 불러오지 못했습니다.");
      const faq = json.items?.[0];
      if (!faq) throw new Error("FAQ를 찾을 수 없습니다.");
      setForm(faqToForm(faq));
    } catch (e) {
      setError(e instanceof Error ? e.message : "로드 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mode === "list") queueMicrotask(() => void loadList());
  }, [mode, loadList]);

  useEffect(() => {
    queueMicrotask(() => {
      if (isEditing && editingId) void loadForEdit(editingId);
      else if (isCreating) setForm(EMPTY_FORM);
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
    const validationError = validateFaqFields(form.question, form.answer);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setFormError(null);
    setSaving(true);
    const payload = {
      question: form.question.trim(),
      answer: form.answer.trim(),
      is_visible: form.isVisible,
      sort_order: form.sortOrder
    };
    try {
      const res = await fetch("/api/admin/community-faq", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEditing ? { id: editingId, ...payload } : payload)
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? "저장에 실패했습니다.");
      }
      goList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const toggleVisible = async (faq: CommunityFaq) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/community-faq", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: faq.id, is_visible: !faq.is_visible })
      });
      if (!res.ok) throw new Error("변경 실패");
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "변경 실패");
    } finally {
      setSaving(false);
    }
  };

  const deleteFaq = async (id: number) => {
    if (!confirm("이 FAQ를 삭제할까요?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/community-faq?id=${id}`, { method: "DELETE" });
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
        title={isEditing ? "FAQ 수정" : "새 FAQ 작성"}
        subtitle={isEditing && editingId != null ? `번호 ${editingId}` : undefined}
        error={error}
        formError={formError}
        saving={saving || loading}
        onBack={goList}
        onSubmit={submit}
        submitLabel={isEditing ? "저장" : "등록"}
      >
        <div>
          <label className={fieldLabelClass}>질문</label>
          <input
            value={form.question}
            onChange={(e) => setForm((f) => ({ ...f, question: e.target.value }))}
            placeholder="질문"
            className={fieldInputClass}
          />
        </div>
        <div>
          <label className={fieldLabelClass}>답변</label>
          <textarea
            value={form.answer}
            onChange={(e) => setForm((f) => ({ ...f, answer: e.target.value }))}
            placeholder="답변 (상세 내용)"
            rows={8}
            className={fieldTextareaClass}
          />
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
          <label className="text-steel text-sm">
            정렬
            <input
              type="number"
              value={form.sortOrder}
              onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) || 0 }))}
              className={`${fieldInputClass} ml-2 w-20`}
            />
          </label>
        </div>
      </AdminFormShell>
    );
  }

  return (
    <AdminListShell
      title="FAQ 관리"
      subtitle="커뮤니티 FAQ 목록과 상세 답변을 관리합니다."
      total={total}
      page={page}
      pageSize={DEFAULT_PAGE_SIZE}
      loading={loading}
      error={error}
      onPageChange={setPage}
      onCreateClick={goCreate}
      createLabel="새 FAQ"
      toolbar={
        <>
          <AdminSearchBar
            value={searchInput}
            onChange={setSearchInput}
            placeholder="질문·답변 검색"
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
              <th className={`${tableThLeftClass} min-w-[14rem]`}>질문</th>
              <th className={tableThClass}>노출</th>
              <th className={tableThClass}>정렬</th>
              <th className={tableThClass}>
                <span className="sr-only">작업</span>
              </th>
            </tr>
          </thead>
          <tbody className={tableBodyClass}>
            {loading && (
              <tr>
                <td colSpan={5} className="text-stone px-4 py-8 text-center">
                  불러오는 중…
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={5} className="text-stone px-4 py-8 text-center">
                  등록된 FAQ가 없습니다.
                </td>
              </tr>
            )}
            {!loading &&
              items.map((faq) => (
                <tr key={faq.id} className={tableRowClass}>
                  <td className={`${tableTdCenterClass} text-stone whitespace-nowrap`}>
                    #{faq.id}
                  </td>
                  <td className="text-ink max-w-[20rem] min-w-[14rem] px-4 py-3.5 text-left font-semibold">
                    <span className="line-clamp-2 break-keep">{faq.question}</span>
                  </td>
                  <td className={`${tableTdCenterClass} whitespace-nowrap`}>
                    {faq.is_visible ? (
                      <Badge tone="brand">노출</Badge>
                    ) : (
                      <Badge tone="neutral">숨김</Badge>
                    )}
                  </td>
                  <td className={`${tableTdCenterClass} text-stone`}>{faq.sort_order}</td>
                  <td className={tableTdCenterClass}>
                    <div className="flex flex-wrap justify-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={saving}
                        onClick={() => goEdit(faq.id)}
                      >
                        수정
                      </Button>
                      {faq.is_visible ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={saving}
                          onClick={() => toggleVisible(faq)}
                        >
                          숨기기
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="accent"
                          disabled={saving}
                          onClick={() => toggleVisible(faq)}
                        >
                          노출
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={saving}
                        onClick={() => deleteFaq(faq.id)}
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
