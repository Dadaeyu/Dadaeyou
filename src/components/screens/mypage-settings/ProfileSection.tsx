"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  AGE_GROUP_UI_OPTIONS,
  ageGroupFromLabel,
  ageGroupToLabel,
  genderFromLabel,
  genderToLabel
} from "@/lib/supabase/types";
import {
  getNicknameSubmitError,
  isNicknameAvailable,
  updateMember,
  uploadAvatar
} from "@/lib/supabase/member";
import NicknameField from "@/components/NicknameField";
import { Button } from "@/components/ui/Button";

type Props = {
  onDirtyChange: (dirty: boolean) => void;
};

export function ProfileSection({ onDirtyChange }: Props) {
  const { user, member, refreshMember } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [nickname, setNickname] = useState("");
  const [gender, setGender] = useState<"남성" | "여성" | "비공개">("비공개");
  const [age, setAge] = useState("비공개");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [nicknameCanSubmit, setNicknameCanSubmit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const baseline = useRef<{
    nickname: string;
    gender: "남성" | "여성" | "비공개";
    age: string;
  }>({ nickname: "", gender: "비공개", age: "비공개" });

  useEffect(() => {
    if (!member) return;
    const g = genderToLabel(member.gender) as "남성" | "여성" | "비공개";
    const a = ageGroupToLabel(member.age_group);
    queueMicrotask(() => {
      setNickname(member.nickname);
      setGender(g);
      setAge(a);
      setAvatarPreview(member.avatar_url);
      baseline.current = { nickname: member.nickname, gender: g, age: a };
      onDirtyChange(false);
    });
  }, [member, onDirtyChange]);

  const markDirty = useCallback(() => {
    const b = baseline.current;
    const dirty = nickname.trim() !== b.nickname.trim() || gender !== b.gender || age !== b.age;
    onDirtyChange(dirty);
  }, [nickname, gender, age, onDirtyChange]);

  useEffect(() => {
    markDirty();
  }, [markDirty]);

  const save = async () => {
    if (!user) return;
    const trimmed = nickname.trim();
    const available = await isNicknameAvailable(trimmed, user.id);
    const validationError = getNicknameSubmitError(trimmed, available);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await updateMember(user.id, {
        nickname: trimmed,
        gender: genderFromLabel(gender),
        age_group: ageGroupFromLabel(age)
      });
      await refreshMember();
      baseline.current = { nickname: trimmed, gender, age };
      onDirtyChange(false);
      setSuccess("개인정보가 저장되었습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const onAvatarChange = async (file: File | undefined) => {
    if (!user || !file) return;
    if (!file.type.startsWith("image/")) {
      setError("이미지 파일만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("프로필 사진은 5MB 이하여야 합니다.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const url = await uploadAvatar(user.id, file);
      setAvatarPreview(url);
      await refreshMember();
      setSuccess("프로필 사진이 변경되었습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "사진 업로드에 실패했습니다.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="max-w-xl space-y-6">
      <div className="flex items-center gap-4">
        <div className="relative">
          <div className="border-hairline flex h-24 w-24 items-center justify-center overflow-hidden rounded-2xl border bg-gray-50 text-4xl">
            {avatarPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarPreview} alt="" className="h-full w-full object-cover" />
            ) : (
              "👤"
            )}
          </div>
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="bg-navy-700 absolute -right-1 -bottom-1 flex h-9 w-9 items-center justify-center rounded-full text-white shadow disabled:opacity-50"
            aria-label="프로필 사진 변경"
          >
            <Camera className="h-4 w-4" />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => void onAvatarChange(e.target.files?.[0])}
          />
        </div>
        <div>
          <p className="text-ink text-sm font-semibold">프로필 사진</p>
          <p className="text-stone mt-0.5 text-xs">
            {uploading ? "업로드 중…" : "클릭하여 변경 (최대 5MB)"}
          </p>
        </div>
      </div>

      <div>
        <label className="text-steel mb-1.5 block text-xs font-semibold">닉네임</label>
        <NicknameField
          value={nickname}
          onChange={setNickname}
          userId={user?.id}
          initialNickname={member?.nickname}
          onCanSubmitChange={setNicknameCanSubmit}
        />
      </div>

      <div>
        <p className="text-steel mb-1.5 text-xs font-semibold">성별</p>
        <div className="flex gap-2">
          {(["남성", "여성", "비공개"] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGender(g)}
              className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition-colors ${
                gender === g
                  ? "bg-brand-50 text-brand-700 ring-brand-300 ring-1"
                  : "border-hairline border bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-steel mb-1.5 text-xs font-semibold">나이대</p>
        <div className="flex flex-wrap gap-2">
          {AGE_GROUP_UI_OPTIONS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAge(a)}
              className={`rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                age === a
                  ? "bg-brand-50 text-brand-700 ring-brand-300 ring-1"
                  : "border-hairline border bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      {success && <p className="text-brand-700 text-sm">{success}</p>}

      <Button
        type="button"
        variant="accent"
        onClick={() => void save()}
        disabled={saving || !nicknameCanSubmit}
      >
        {saving ? "저장 중…" : "저장"}
      </Button>
    </div>
  );
}
