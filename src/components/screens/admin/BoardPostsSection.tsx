"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { formatDate } from "./helpers";
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

type AdminBoardPost = {
  post_id: number;
  board_id: number;
  board_nm: string;
  title: string;
  content?: string;
  writer_nm: string;
  rating: number | null;
  view_cnt: number;
  like_cnt: number;
  comment_cnt: number;
  notice_yn: boolean;
  use_yn: boolean;
  created_at: string;
  updated_at?: string;
};

type BoardOption = { board_id: number; board_nm: string };

type PostFormState = {
  title: string;
  content: string;
  useYn: boolean;
};

export function BoardPostsSection() {
  const { mode, editingId, page, q, goList, goEdit, setPage, setQuery, setFilter, filterValue } =
    useAdminListMode();

  const [items, setItems] = useState<AdminBoardPost[]>([]);
  const [boards, setBoards] = useState<BoardOption[]>([]);
  const [editPost, setEditPost] = useState<AdminBoardPost | null>(null);
  const [form, setForm] = useState<PostFormState>({
    title: "",
    content: "",
    useYn: true
  });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState(q);

  const boardFilter = filterValue("boardId");
  const isEditing = mode === "edit" && editingId !== null;

  useEffect(() => {
    fetch("/api/admin/boards?pageSize=100")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => setBoards((json?.items as BoardOption[]) ?? []))
      .catch(() => {});
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page + 1));
      params.set("pageSize", String(DEFAULT_PAGE_SIZE));
      if (q) params.set("q", q);
      if (boardFilter !== "all") params.set("boardId", boardFilter);

      const res = await fetch(`/api/admin/board-posts?${params}`);
      const json = (await res.json().catch(() => ({}))) as {
        items?: AdminBoardPost[];
        total?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "게시글 목록을 불러오지 못했습니다.");
      setItems(json.items ?? []);
      setTotal(json.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "로드 실패");
    } finally {
      setLoading(false);
    }
  }, [page, q, boardFilter]);

  const loadForEdit = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/board-posts?id=${id}`);
      const json = (await res.json().catch(() => ({}))) as {
        items?: AdminBoardPost[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "게시글을 불러오지 못했습니다.");
      const post = json.items?.[0];
      if (!post) throw new Error("게시글을 찾을 수 없습니다.");
      setEditPost(post);
      setForm({
        title: post.title,
        content: post.content ?? "",
        useYn: post.use_yn
      });
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
    if (isEditing && editingId) queueMicrotask(() => void loadForEdit(editingId));
    else queueMicrotask(() => setEditPost(null));
  }, [isEditing, editingId, loadForEdit]);

  useEffect(() => {
    if (mode !== "list") return;
    const t = setTimeout(() => setQuery(searchInput), 300);
    return () => clearTimeout(t);
  }, [mode, searchInput, setQuery]);

  useEffect(() => {
    queueMicrotask(() => setSearchInput(q));
  }, [q]);

  const savePost = async () => {
    if (saving) return;
    if (!editingId) return;
    if (!form.title.trim() || !form.content.trim()) {
      setFormError("제목과 내용을 입력해 주세요.");
      return;
    }
    setSaving(true);
    setError(null);
    setFormError(null);
    try {
      const res = await fetch("/api/admin/board-posts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          title: form.title.trim(),
          content: form.content.trim(),
          use_yn: form.useYn
        })
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "수정에 실패했습니다.");
      goList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const togglePatch = async (id: number, patch: Record<string, boolean>) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/board-posts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch })
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "변경에 실패했습니다.");
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "변경 실패");
    } finally {
      setSaving(false);
    }
  };

  const deletePost = async (id: number) => {
    if (!confirm("이 게시글을 삭제할까요? 되돌릴 수 없습니다.")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/board-posts?id=${id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "삭제에 실패했습니다.");
      if (isEditing) goList();
      else await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setSaving(false);
    }
  };

  if (isEditing) {
    return (
      <AdminFormShell
        title="게시글 수정"
        subtitle={editingId != null ? `번호 ${editingId}` : undefined}
        error={error}
        formError={formError}
        saving={saving || loading}
        onBack={goList}
        onSubmit={savePost}
        submitLabel="저장"
      >
        {editPost && (
          <div className="text-stone flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span>게시판: {editPost.board_nm}</span>
            <span>작성자: {editPost.writer_nm}</span>
            <span>조회 {editPost.view_cnt}</span>
            <span>좋아요 {editPost.like_cnt}</span>
            <span>댓글 {editPost.comment_cnt}</span>
            {editPost.rating != null && <span>평점 {editPost.rating}</span>}
            <span>작성일 {formatDate(editPost.created_at)}</span>
          </div>
        )}
        <div>
          <label className={fieldLabelClass}>제목</label>
          <input
            value={form.title}
            onChange={(e) => {
              setForm((prev) => ({ ...prev, title: e.target.value }));
              setFormError(null);
            }}
            className={fieldInputClass}
          />
        </div>
        <div>
          <label className={fieldLabelClass}>내용</label>
          <textarea
            value={form.content}
            onChange={(e) => {
              setForm((prev) => ({ ...prev, content: e.target.value }));
              setFormError(null);
            }}
            rows={8}
            className={fieldTextareaClass}
          />
        </div>
        <div className="flex flex-wrap gap-4 pt-1">
          <label className="text-stone flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.useYn}
              onChange={(e) => setForm((prev) => ({ ...prev, useYn: e.target.checked }))}
            />
            사용 여부
          </label>
        </div>
        {editPost && (
          <div className="border-hairline-soft flex justify-end border-t pt-4">
            <Button
              size="sm"
              variant="destructive"
              disabled={saving}
              onClick={() => deletePost(editPost.post_id)}
            >
              삭제
            </Button>
          </div>
        )}
      </AdminFormShell>
    );
  }

  return (
    <AdminListShell
      title="게시글 관리"
      subtitle="게시판 게시글을 조회·수정·삭제합니다."
      total={total}
      page={page}
      pageSize={DEFAULT_PAGE_SIZE}
      loading={loading}
      error={error}
      onPageChange={setPage}
      toolbar={
        <>
          <AdminSearchBar
            value={searchInput}
            onChange={setSearchInput}
            placeholder="제목 또는 작성자 검색"
          />
          <Select
            value={boardFilter}
            onChange={(v) => setFilter("boardId", v === "all" ? null : v)}
            ariaLabel="게시판 필터"
            className={`${fieldSelectClass} w-auto`}
            options={[
              { value: "all", label: "전체 게시판" },
              ...boards.map((b) => ({ value: String(b.board_id), label: b.board_nm }))
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
              <th className={tableThClass}>게시판</th>
              <th className={`${tableThLeftClass} min-w-[14rem]`}>제목</th>
              <th className={tableThClass}>작성자</th>
              <th className={tableThClass}>조회</th>
              <th className={tableThClass}>좋아요</th>
              <th className={tableThClass}>댓글</th>
              <th className={tableThClass}>공지</th>
              <th className={tableThClass}>사용 여부</th>
              <th className={tableThClass}>작성일</th>
              <th className={tableThClass}>
                <span className="sr-only">작업</span>
              </th>
            </tr>
          </thead>
          <tbody className={tableBodyClass}>
            {loading && (
              <tr>
                <td colSpan={11} className="text-stone px-4 py-8 text-center">
                  불러오는 중…
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={11} className="text-stone px-4 py-8 text-center">
                  게시글이 없습니다.
                </td>
              </tr>
            )}
            {!loading &&
              items.map((p) => (
                <tr key={p.post_id} className={tableRowClass}>
                  <td className={`${tableTdCenterClass} text-stone whitespace-nowrap`}>
                    #{p.post_id}
                  </td>
                  <td className={`${tableTdCenterClass} text-stone whitespace-nowrap`}>
                    {p.board_nm}
                  </td>
                  <td className="text-ink max-w-[20rem] min-w-[14rem] px-4 py-3.5 text-left font-semibold">
                    <span className="line-clamp-2 break-keep">{p.title}</span>
                  </td>
                  <td className={`${tableTdCenterClass} text-stone`}>{p.writer_nm}</td>
                  <td className={`${tableTdCenterClass} text-stone`}>{p.view_cnt}</td>
                  <td className={`${tableTdCenterClass} text-stone`}>{p.like_cnt}</td>
                  <td className={`${tableTdCenterClass} text-stone`}>{p.comment_cnt}</td>
                  <td className={tableTdCenterClass}>
                    {p.notice_yn && <Badge tone="warn">공지</Badge>}
                  </td>
                  <td className={tableTdCenterClass}>
                    <Badge tone={p.use_yn ? "brand" : "error"}>
                      {p.use_yn ? "사용" : "미사용"}
                    </Badge>
                  </td>
                  <td className={`${tableTdCenterClass} text-stone text-xs whitespace-nowrap`}>
                    {formatDate(p.created_at)}
                  </td>
                  <td className={tableTdCenterClass}>
                    <div className="flex justify-center gap-1.5">
                      <Button
                        size="iconSm"
                        variant="outline"
                        disabled={saving}
                        title="수정"
                        aria-label="수정"
                        onClick={() => goEdit(p.post_id)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="iconSm"
                        variant={p.use_yn ? "secondary" : "accent"}
                        disabled={saving}
                        title={p.use_yn ? "미사용으로 변경" : "사용으로 변경"}
                        aria-label={p.use_yn ? "미사용으로 변경" : "사용으로 변경"}
                        onClick={() => togglePatch(p.post_id, { use_yn: !p.use_yn })}
                      >
                        {p.use_yn ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                      </Button>
                      <Button
                        size="iconSm"
                        variant="destructive"
                        disabled={saving}
                        title="삭제"
                        aria-label="삭제"
                        onClick={() => deletePost(p.post_id)}
                      >
                        <Trash2 className="size-4" />
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
