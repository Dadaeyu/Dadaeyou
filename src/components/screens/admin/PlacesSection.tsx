"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, X, Eye, EyeOff, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { ACCESSIBILITY_GROUPS } from "@/lib/place/accessibilityFields";
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
  tableThClass,
  tableThLeftClass,
  tableWrapClass
} from "./adminUi";

type AdminPlace = {
  place_id: number;
  contentid: string;
  title: string;
  addr1: string | null;
  dong: string | null;
  ldongsigngucd: string | null;
  mapx: string | number | null;
  mapy: string | number | null;
  lclssystm1: string | null;
  firstimage: string | null;
  use_yn: string | null;
  delete_yn: string | null;
  registtime: string | null;
  tb_place_detail_normalized?:
    | {
        overview: string | null;
        infocenter: string | null;
        usetime: string | null;
        restdate: string | null;
      }[]
    | null;
  tb_place_barrierfree?: Record<string, string | null>[] | null;
};

type Option = { code: string; name: string };

type FormState = {
  title: string;
  gu: string;
  dong: string;
  roadName: string;
  mapx: string;
  mapy: string;
  lclssystm1: string;
  firstimage: string;
  overview: string;
  tel: string;
  usetime: string;
  restdate: string;
  accessibility: Record<string, string>;
  useYn: boolean;
};

const EMPTY_FORM: FormState = {
  title: "",
  gu: "",
  dong: "",
  roadName: "",
  mapx: "",
  mapy: "",
  lclssystm1: "",
  firstimage: "",
  overview: "",
  tel: "",
  usetime: "",
  restdate: "",
  accessibility: {},
  useYn: true
};

const sideLabelClass = "text-stone shrink-0 text-xs font-semibold sm:mb-0 sm:w-24";

function single<T>(v: T[] | T | null | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

// addr1이 "대전광역시 {구} {도로명} ({동})" 형식으로 저장돼 있으므로, 수정 화면에는 도로명만 뽑아 보여준다.
function extractRoadName(addr1: string, guName: string, dong: string): string {
  const prefix = `대전광역시 ${guName} `;
  const suffix = ` (${dong})`;
  if (addr1.startsWith(prefix) && addr1.endsWith(suffix)) {
    return addr1.slice(prefix.length, addr1.length - suffix.length);
  }
  return addr1;
}

function placeToForm(place: AdminPlace, guOptions: Option[]): FormState {
  const detail = single(place.tb_place_detail_normalized);
  const bf = single(place.tb_place_barrierfree);
  const accessibility: Record<string, string> = {};
  if (bf) {
    for (const group of ACCESSIBILITY_GROUPS) {
      for (const field of group.fields) {
        const value = bf[field.key];
        if (value) accessibility[field.key] = value;
      }
    }
  }
  const guName = guOptions.find((g) => g.code === place.ldongsigngucd)?.name ?? "";
  return {
    title: place.title,
    gu: place.ldongsigngucd ?? "",
    dong: place.dong ?? "",
    roadName: place.addr1 ? extractRoadName(place.addr1, guName, place.dong ?? "") : "",
    mapx: place.mapx != null ? String(place.mapx) : "",
    mapy: place.mapy != null ? String(place.mapy) : "",
    lclssystm1: place.lclssystm1 ?? "",
    firstimage: place.firstimage ?? "",
    overview: detail?.overview ?? "",
    tel: detail?.infocenter ?? "",
    usetime: detail?.usetime ?? "",
    restdate: detail?.restdate ?? "",
    accessibility,
    useYn: place.use_yn !== "N"
  };
}

export function PlacesSection() {
  const { mode, editingId, page, q, goList, goCreate, goEdit, setPage, setQuery } =
    useAdminListMode();

  const [items, setItems] = useState<AdminPlace[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [searchInput, setSearchInput] = useState(q);
  const [guOptions, setGuOptions] = useState<Option[]>([]);
  const [dongOptions, setDongOptions] = useState<string[]>([]);
  const [themeOptions, setThemeOptions] = useState<Option[]>([]);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const isEditing = mode === "edit" && editingId !== null;
  const isCreating = mode === "create";

  const uploadImage = async (file: File) => {
    setUploadingImage(true);
    setFormError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      const res = await fetch("/api/admin/place-media", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error ?? "이미지 업로드에 실패했습니다.");
      setForm((f) => ({ ...f, firstimage: json.url! }));
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "이미지 업로드 실패");
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  useEffect(() => {
    fetch("/api/area-code")
      .then((r) => r.json())
      .then((data) => setGuOptions(Array.isArray(data) ? data : []))
      .catch(() => {});
    fetch("/api/codes/filter-options")
      .then((r) => r.json())
      .then((data: { themes?: Option[] }) => {
        setThemeOptions(data.themes ?? []);
      })
      .catch(() => {});
  }, []);

  // 구 선택 → 그 구에 속한 동만 드롭다운으로.
  useEffect(() => {
    if (!form.gu) {
      setDongOptions([]);
      return;
    }
    let active = true;
    fetch(`/api/area-code/dong?gu=${encodeURIComponent(form.gu)}`)
      .then((r) => r.json())
      .then((data) => {
        if (active) setDongOptions(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (active) setDongOptions([]);
      });
    return () => {
      active = false;
    };
  }, [form.gu]);

  const geocodeAddress = async () => {
    if (!form.gu || !form.dong || !form.roadName.trim()) {
      setGeocodeError("구/동, 도로명을 모두 입력해야 좌표를 찾을 수 있어요.");
      setForm((f) => ({ ...f, mapx: "", mapy: "" }));
      return;
    }
    const guName = guOptions.find((g) => g.code === form.gu)?.name ?? "";
    const query = ["대전", guName, form.dong, form.roadName].filter(Boolean).join(" ").trim();
    setGeocoding(true);
    setGeocodeError(null);
    try {
      const res = await fetch(`/api/admin/places/geocode?query=${encodeURIComponent(query)}`);
      const json = (await res.json().catch(() => ({}))) as {
        mapx?: number;
        mapy?: number;
        error?: string;
      };
      if (!res.ok || json.mapx == null || json.mapy == null) {
        throw new Error(json.error ?? "좌표를 찾지 못했어요.");
      }
      setForm((f) => ({ ...f, mapx: String(json.mapx), mapy: String(json.mapy) }));
    } catch (e) {
      setGeocodeError(e instanceof Error ? e.message : "좌표를 찾지 못했어요.");
      setForm((f) => ({ ...f, mapx: "", mapy: "" }));
    } finally {
      setGeocoding(false);
    }
  };

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page + 1));
      params.set("pageSize", String(DEFAULT_PAGE_SIZE));
      if (q) params.set("q", q);
      const res = await fetch(`/api/admin/places?${params}`);
      const json = (await res.json().catch(() => ({}))) as {
        items?: AdminPlace[];
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
  }, [page, q]);

  const loadForEdit = useCallback(
    async (id: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/places?id=${id}`);
        const json = (await res.json().catch(() => ({}))) as {
          items?: AdminPlace[];
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? "장소를 불러오지 못했습니다.");
        const place = json.items?.[0];
        if (!place) throw new Error("장소를 찾을 수 없습니다.");
        setForm(placeToForm(place, guOptions));
      } catch (e) {
        setError(e instanceof Error ? e.message : "로드 실패");
      } finally {
        setLoading(false);
      }
    },
    [guOptions]
  );

  useEffect(() => {
    if (mode === "list") queueMicrotask(() => void loadList());
  }, [mode, loadList]);

  useEffect(() => {
    queueMicrotask(() => {
      if (isEditing && editingId) void loadForEdit(editingId);
      else if (isCreating) {
        setForm(EMPTY_FORM);
        setLoading(false);
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

  const setAccessibilityField = (key: string, value: string) => {
    setForm((f) => ({ ...f, accessibility: { ...f.accessibility, [key]: value } }));
  };

  const submit = async () => {
    if (!form.title.trim()) return setFormError("장소명을 입력해 주세요.");
    if (!form.gu) return setFormError("구를 선택해 주세요.");
    if (!form.dong) return setFormError("동을 선택해 주세요.");
    if (!form.roadName.trim()) return setFormError("도로명을 입력해 주세요.");
    if (!form.lclssystm1) return setFormError("테마를 선택해 주세요.");
    if (
      !form.mapx.trim() ||
      !form.mapy.trim() ||
      Number.isNaN(Number(form.mapx)) ||
      Number.isNaN(Number(form.mapy))
    ) {
      return setFormError("좌표(위도/경도)를 올바르게 입력해 주세요.");
    }
    setFormError(null);
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      gu: form.gu,
      dong: form.dong.trim(),
      roadName: form.roadName.trim(),
      mapx: Number(form.mapx),
      mapy: Number(form.mapy),
      lclssystm1: form.lclssystm1,
      firstimage: form.firstimage.trim(),
      overview: form.overview.trim(),
      tel: form.tel.trim(),
      usetime: form.usetime.trim(),
      restdate: form.restdate.trim(),
      accessibility: form.accessibility,
      useYn: form.useYn
    };
    try {
      const res = await fetch("/api/admin/places", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEditing ? { id: editingId, ...payload } : payload)
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "저장에 실패했습니다.");
      goList();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const deletePlace = async (id: number) => {
    if (!confirm("이 장소를 삭제할까요?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/places?id=${id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "삭제 실패");
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제 실패");
    } finally {
      setSaving(false);
    }
  };

  const restorePlace = async (id: number) => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/places", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, quickAction: "restore" })
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "복구 실패");
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "복구 실패");
    } finally {
      setSaving(false);
    }
  };

  // 코스 공유여부 토글과 동일하게, 목록에서 바로 사용여부를 뒤집는다(수정 화면 안 거침).
  const toggleUseYn = async (place: AdminPlace) => {
    const nextUseYn = place.use_yn === "N";
    setSaving(true);
    try {
      const res = await fetch("/api/admin/places", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: place.place_id, quickAction: "set-use-yn", useYn: nextUseYn })
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "변경 실패");
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : "변경 실패");
    } finally {
      setSaving(false);
    }
  };

  const themeName = (code: string | null) =>
    themeOptions.find((t) => t.code === code)?.name ?? code ?? "—";

  if (isCreating || isEditing) {
    return (
      <AdminFormShell
        title={isEditing ? "장소 수정" : "새 장소 등록"}
        subtitle={isEditing && editingId != null ? `번호 ${editingId}` : undefined}
        error={error}
        formError={formError}
        saving={saving || loading}
        onBack={goList}
        onSubmit={submit}
        submitLabel={isEditing ? "저장" : "등록"}
        wide
      >
        <label className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <span className={sideLabelClass}>
            장소명 <span className="text-error">*</span>
          </span>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="장소명을 입력하세요"
            className={fieldInputClass}
          />
        </label>

        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <span className={sideLabelClass}>
            구 / 동 <span className="text-error">*</span>
          </span>
          <div className="flex min-w-0 flex-1 flex-wrap gap-2">
            <Select
              value={form.gu}
              onChange={(v) => setForm((f) => ({ ...f, gu: v, dong: "" }))}
              ariaLabel="구"
              className={`${fieldSelectClass} min-w-[8rem] flex-1`}
              options={[
                { value: "", label: "구 선택" },
                ...guOptions.map((g) => ({ value: g.code, label: g.name }))
              ]}
            />
            <Select
              value={form.dong}
              onChange={(v) => setForm((f) => ({ ...f, dong: v }))}
              disabled={!form.gu}
              ariaLabel="동"
              className={`${fieldSelectClass} min-w-[8rem] flex-1 disabled:opacity-60`}
              options={[
                { value: "", label: form.gu ? "동 선택" : "구를 먼저 선택하세요" },
                ...dongOptions.map((d) => ({ value: d, label: d }))
              ]}
            />
          </div>
        </div>

        <label className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <span className={sideLabelClass}>
            도로명 <span className="text-error">*</span>
          </span>
          <div className="flex min-w-0 flex-1 gap-2">
            <input
              value={form.roadName}
              onChange={(e) => setForm((f) => ({ ...f, roadName: e.target.value }))}
              placeholder="예: 온천로 89 (지번 아닌 도로명으로 입력)"
              className={`${fieldInputClass} flex-1`}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={geocoding}
              onClick={geocodeAddress}
            >
              {geocoding ? "찾는 중…" : "좌표 찾기"}
            </Button>
          </div>
        </label>
        {geocodeError && (
          <p className="text-error -mt-2 text-xs sm:ml-[calc(6rem+0.75rem)]">{geocodeError}</p>
        )}

        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <span className={sideLabelClass}>
            좌표 <span className="text-error">*</span>
          </span>
          <div className="flex min-w-0 flex-1 gap-2">
            <input
              value={form.mapy}
              onChange={(e) => setForm((f) => ({ ...f, mapy: e.target.value }))}
              placeholder="위도(mapy)"
              inputMode="decimal"
              className={`${fieldInputClass} flex-1`}
            />
            <input
              value={form.mapx}
              onChange={(e) => setForm((f) => ({ ...f, mapx: e.target.value }))}
              placeholder="경도(mapx)"
              inputMode="decimal"
              className={`${fieldInputClass} flex-1`}
            />
          </div>
        </div>

        <label className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <span className={sideLabelClass}>
            테마 <span className="text-error">*</span>
          </span>
          <Select
            value={form.lclssystm1}
            onChange={(v) => setForm((f) => ({ ...f, lclssystm1: v }))}
            ariaLabel="테마"
            className={`${fieldSelectClass} w-auto`}
            options={[
              { value: "", label: "테마 선택" },
              ...themeOptions.map((t) => ({ value: t.code, label: t.name }))
            ]}
          />
        </label>

        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <span className={sideLabelClass}>사용여부</span>
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, useYn: !f.useYn }))}
            aria-pressed={form.useYn}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              form.useYn
                ? "border-navy-600 bg-navy-600 text-white"
                : "border-hairline text-steel hover:bg-surface-soft"
            }`}
          >
            {form.useYn ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {form.useYn ? "사용함" : "사용 안 함"}
          </button>
          <span className="text-stone text-xs">해제하면 지도/검색에 노출되지 않아요</span>
        </div>

        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
          <span className={`${sideLabelClass} sm:pt-2.5`}>대표이미지</span>
          <div className="flex-1 space-y-2">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadImage(file);
              }}
            />
            {form.firstimage ? (
              <div className="border-hairline bg-surface-soft relative w-fit overflow-hidden rounded-xl border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={form.firstimage}
                  alt="대표이미지 미리보기"
                  className="h-32 w-48 object-contain"
                />
                <div className="absolute top-2 right-2 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={uploadingImage}
                    onClick={() => imageInputRef.current?.click()}
                  >
                    변경
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="bg-background/90"
                    disabled={uploadingImage}
                    onClick={() => setForm((f) => ({ ...f, firstimage: "" }))}
                    aria-label="대표이미지 제거"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={uploadingImage}
                onClick={() => imageInputRef.current?.click()}
                className="border-hairline hover:bg-surface-soft bg-background text-steel flex h-32 w-48 flex-col items-center justify-center gap-2 rounded-xl border border-dashed transition-colors"
              >
                <ImagePlus className="h-6 w-6" />
                <span className="text-sm font-medium">
                  {uploadingImage ? "업로드 중…" : "사진 등록"}
                </span>
                <span className="text-stone text-xs">JPEG, PNG, WebP, GIF · 최대 5MB</span>
              </button>
            )}
          </div>
        </div>

        <label className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <span className={sideLabelClass}>전화/문의처</span>
          <input
            value={form.tel}
            onChange={(e) => setForm((f) => ({ ...f, tel: e.target.value }))}
            placeholder="042-000-0000"
            className={fieldInputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <span className={sideLabelClass}>이용시간</span>
          <input
            value={form.usetime}
            onChange={(e) => setForm((f) => ({ ...f, usetime: e.target.value }))}
            placeholder="예: 매일 09:00~18:00"
            className={fieldInputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <span className={sideLabelClass}>쉬는날</span>
          <input
            value={form.restdate}
            onChange={(e) => setForm((f) => ({ ...f, restdate: e.target.value }))}
            placeholder="예: 매주 월요일"
            className={fieldInputClass}
          />
        </label>

        <label className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
          <span className={`${sideLabelClass} sm:pt-2.5`}>소개글</span>
          <textarea
            value={form.overview}
            onChange={(e) => setForm((f) => ({ ...f, overview: e.target.value }))}
            placeholder="장소 소개"
            rows={3}
            className={fieldTextareaClass}
          />
        </label>

        <div className="space-y-3">
          <p className={fieldLabelClass}>
            접근성 정보 (장소 상세에 표시되는 항목과 동일, 비우면 표시 안 됨)
          </p>
          {ACCESSIBILITY_GROUPS.map((group) => (
            <div key={group.category} className="border-hairline-soft rounded-xl border p-3">
              <p className="text-steel mb-2 text-xs font-bold">{group.category}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {group.fields.map((field) => (
                  <label key={field.key} className="space-y-1">
                    <span className="text-stone block text-xs">{field.label}</span>
                    <input
                      value={form.accessibility[field.key] ?? ""}
                      onChange={(e) => setAccessibilityField(field.key, e.target.value)}
                      placeholder="예: 가능"
                      className={`${fieldInputClass} py-1.5 text-xs`}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </AdminFormShell>
    );
  }

  return (
    <AdminListShell
      title="장소 관리"
      subtitle="관리자가 직접 등록한 장소를 관리합니다 (정부 API 동기화 장소는 별도)."
      total={total}
      page={page}
      pageSize={DEFAULT_PAGE_SIZE}
      loading={loading}
      error={error}
      onPageChange={setPage}
      onCreateClick={goCreate}
      createLabel="장소 등록"
      toolbar={
        <AdminSearchBar value={searchInput} onChange={setSearchInput} placeholder="장소명 검색" />
      }
    >
      <div className={`${tableWrapClass} h-[30rem] overflow-y-auto`}>
        <table className={tableClass}>
          <thead className="sticky top-0 z-10">
            <tr className={tableHeadRowClass}>
              <th className={tableThClass}>ID</th>
              <th className={`${tableThLeftClass} min-w-[12rem]`}>장소명</th>
              <th className={`${tableThLeftClass} min-w-[14rem]`}>주소</th>
              <th className={tableThClass}>테마</th>
              <th className={tableThClass}>사용여부</th>
              <th className={tableThClass}>
                <span className="sr-only">작업</span>
              </th>
            </tr>
          </thead>
          <tbody className={tableBodyClass}>
            {loading && (
              <tr>
                <td colSpan={6} className="text-stone px-4 py-3 text-center">
                  불러오는 중…
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={6} className="text-stone px-4 py-3 text-center">
                  관리자가 등록한 장소가 없습니다.
                </td>
              </tr>
            )}
            {!loading &&
              items.map((place) => (
                <tr key={place.place_id} className={tableRowClass}>
                  <td className="text-steel px-4 py-3 text-center whitespace-nowrap">
                    #{place.place_id}
                  </td>
                  <td className="text-ink max-w-[18rem] min-w-[12rem] px-4 py-3 text-left">
                    <div className="flex items-center gap-1.5">
                      <span className="line-clamp-1 font-semibold break-keep">{place.title}</span>
                      {place.delete_yn === "Y" && <Badge tone="neutral">삭제됨</Badge>}
                    </div>
                  </td>
                  <td className="text-ink max-w-[16rem] min-w-[14rem] px-4 py-3 text-left">
                    <span className="line-clamp-1 break-keep">{place.addr1 || "-"}</span>
                  </td>
                  <td className="text-steel px-4 py-3 text-center whitespace-nowrap">
                    {themeName(place.lclssystm1)}
                  </td>
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    {place.delete_yn === "Y" ? (
                      <span className="text-stone text-xs">-</span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="iconSm"
                        onClick={() => toggleUseYn(place)}
                        disabled={saving}
                        title="사용 여부 변경"
                        aria-label="사용 여부 변경"
                        className="text-stone hover:bg-surface-soft hover:text-ink rounded-full"
                      >
                        {place.use_yn !== "N" ? (
                          <Eye className="h-4 w-4" />
                        ) : (
                          <EyeOff className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex flex-wrap justify-center gap-1.5">
                      {place.delete_yn === "Y" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={saving}
                          onClick={() => restorePlace(place.place_id)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          복구
                        </Button>
                      ) : (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={saving}
                            onClick={() => goEdit(place.place_id)}
                          >
                            수정
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={saving}
                            onClick={() => deletePlace(place.place_id)}
                          >
                            삭제
                          </Button>
                        </>
                      )}
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
