"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { type UserRole, type UserStatus } from "@/lib/supabase/types";
import { CommunityLevelBadge } from "@/components/community/CommunityLevelBadge";
import { AdminSearchBar } from "./AdminSearchBar";
import { Select } from "@/components/ui/Select";
import { formatDate } from "./helpers";
import {
  adminAlertClass,
  adminPanelClass,
  emptyStateClass,
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

type AdminUser = {
  id: string;
  nickname: string;
  email: string | null;
  role: UserRole;
  status: UserStatus;
  community_level: number;
  suspended_reason: string | null;
  created_at: string;
};

type SortKey = "created_at" | "nickname" | "role";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "created_at", label: "최신 가입순" },
  { value: "nickname", label: "닉네임순" },
  { value: "role", label: "역할순" }
];

const TABLE_COLUMNS = [
  { key: "no", label: "No.", align: "center" as const, className: "w-12" },
  { key: "nickname", label: "닉네임", align: "left" as const, className: "w-[7.5rem]" },
  { key: "email", label: "이메일", align: "left" as const, className: "min-w-[10rem]" },
  { key: "created_at", label: "가입일", align: "center" as const, className: "w-28" },
  { key: "level", label: "등급", align: "center" as const, className: "w-24" },
  { key: "role", label: "역할", align: "center" as const, className: "w-20" },
  { key: "status", label: "상태", align: "center" as const, className: "w-20" },
  { key: "actions", label: null, align: "center" as const, className: "w-44" }
] as const;

function sortUsers(users: AdminUser[], sortKey: SortKey): AdminUser[] {
  const list = [...users];
  list.sort((a, b) => {
    if (sortKey === "nickname") {
      return a.nickname.localeCompare(b.nickname, "ko");
    }
    if (sortKey === "role") {
      if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
      return a.nickname.localeCompare(b.nickname, "ko");
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
  return list;
}

export function UsersSection() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | UserRole>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<AdminUser | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [saving, setSaving] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (roleFilter !== "all") params.set("role", roleFilter);

      const res = await fetch(`/api/admin/users?${params}`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "사용자 목록을 불러오지 못했습니다.");
      }
      const json = (await res.json()) as { users: AdminUser[] };
      setUsers(json.users ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "로드 실패");
    } finally {
      setLoading(false);
    }
  }, [query, roleFilter]);

  useEffect(() => {
    const t = setTimeout(loadUsers, 300);
    return () => clearTimeout(t);
  }, [loadUsers]);

  const sortedUsers = useMemo(() => sortUsers(users, sortKey), [users, sortKey]);

  const patchUser = async (
    id: string,
    patch: { role?: UserRole; status?: UserStatus; suspended_reason?: string }
  ) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "변경에 실패했습니다.");

      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...json.user } : u)));
      setSuspendTarget(null);
      setSuspendReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "변경 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-ink text-xl font-semibold tracking-[-0.02em]">사용자 관리</h1>
          <p className="text-stone mt-1 text-sm">역할·정지 상태를 관리합니다.</p>
        </div>
        <span className="text-stone text-sm tabular-nums">총 {users.length}명</span>
      </div>

      {error && <div className={adminAlertClass}>{error}</div>}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <AdminSearchBar value={query} onChange={setQuery} placeholder="닉네임 또는 이메일 검색" />
        <div className="flex shrink-0 gap-2">
          <Select
            value={roleFilter}
            onChange={(v) => setRoleFilter(v as "all" | UserRole)}
            ariaLabel="역할 필터"
            className={`${fieldSelectClass} w-auto min-w-[7.5rem]`}
            options={[
              { value: "all", label: "전체 역할" },
              { value: "user", label: "일반" },
              { value: "admin", label: "관리자" }
            ]}
          />
          <Select
            value={sortKey}
            onChange={(v) => setSortKey(v as SortKey)}
            ariaLabel="정렬 기준"
            className={`${fieldSelectClass} w-auto min-w-[8.5rem]`}
            options={SORT_OPTIONS}
          />
        </div>
      </div>

      <div className={adminPanelClass}>
        {loading ? (
          <p className={emptyStateClass}>불러오는 중…</p>
        ) : sortedUsers.length === 0 ? (
          <p className={emptyStateClass}>검색 결과가 없습니다.</p>
        ) : (
          <div className={tableWrapClass}>
            <table className={`${tableClass} min-w-[52rem] table-fixed`}>
              <thead>
                <tr className={tableHeadRowClass}>
                  {TABLE_COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className={`${col.align === "left" ? tableThLeftClass : tableThClass} ${col.className}`}
                    >
                      {col.label ?? <span className="sr-only">작업</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className={tableBodyClass}>
                {sortedUsers.map((u, index) => (
                  <tr key={u.id} className={tableRowClass}>
                    <td className={`${tableTdCenterClass} text-stone tabular-nums`}>{index + 1}</td>
                    <td className="text-ink px-4 py-3.5 text-left align-middle font-semibold">
                      <span className="block truncate" title={u.nickname}>
                        {u.nickname}
                      </span>
                    </td>
                    <td className="text-steel px-4 py-3.5 text-left align-middle">
                      <span className="block truncate" title={u.email ?? undefined}>
                        {u.email ?? "—"}
                      </span>
                    </td>
                    <td
                      className={`${tableTdCenterClass} text-stone whitespace-nowrap tabular-nums`}
                    >
                      {formatDate(u.created_at)}
                    </td>
                    <td className={tableTdCenterClass}>
                      <div className="flex justify-center">
                        <CommunityLevelBadge level={u.community_level} size="sm" />
                      </div>
                    </td>
                    <td className={tableTdCenterClass}>
                      <Badge tone={u.role === "admin" ? "brand" : "neutral"}>
                        {u.role === "admin" ? "관리자" : "일반"}
                      </Badge>
                    </td>
                    <td className={tableTdCenterClass}>
                      <Badge
                        tone={
                          u.status === "active"
                            ? "brand"
                            : u.status === "withdrawn"
                              ? "neutral"
                              : "error"
                        }
                      >
                        {u.status === "active"
                          ? "정상"
                          : u.status === "withdrawn"
                            ? "탈퇴"
                            : "정지"}
                      </Badge>
                    </td>
                    <td className={tableTdCenterClass}>
                      <div className="flex items-center justify-center gap-1.5">
                        {u.status === "withdrawn" ? (
                          <span className="text-stone text-xs">—</span>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant={u.role === "admin" ? "secondary" : "outline"}
                              disabled={saving}
                              className="h-8 px-2.5 text-xs whitespace-nowrap"
                              onClick={() =>
                                patchUser(u.id, {
                                  role: u.role === "admin" ? "user" : "admin"
                                })
                              }
                            >
                              {u.role === "admin" ? "일반 전환" : "관리자 지정"}
                            </Button>
                            {u.status === "active" ? (
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={saving}
                                className="h-8 px-2.5 text-xs whitespace-nowrap"
                                onClick={() => {
                                  setSuspendTarget(u);
                                  setSuspendReason("");
                                }}
                              >
                                정지
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="accent"
                                disabled={saving}
                                className="h-8 px-2.5 text-xs whitespace-nowrap"
                                onClick={() => patchUser(u.id, { status: "active" })}
                              >
                                해제
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {suspendTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="border-hairline-soft bg-background w-full max-w-md rounded-2xl border p-6 shadow-xl">
            <h3 className="text-ink mb-1 text-lg font-semibold">활동 정지</h3>
            <p className="text-steel mb-4 text-sm">
              <strong className="text-ink">{suspendTarget.nickname}</strong> 계정을 정지합니다.
            </p>
            <label className={fieldLabelClass}>정지 사유</label>
            <textarea
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              rows={3}
              placeholder="정지 사유를 입력하세요"
              className={`${fieldTextareaClass} mb-4`}
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setSuspendTarget(null)} disabled={saving}>
                취소
              </Button>
              <Button
                variant="default"
                disabled={saving}
                onClick={() =>
                  patchUser(suspendTarget.id, {
                    status: "suspended",
                    suspended_reason: suspendReason
                  })
                }
              >
                정지하기
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
