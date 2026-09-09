import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { WITHDRAW_CONFIRM_TEXT } from "@/lib/auth/withdraw";
import { hasEmailPasswordAuth } from "@/lib/auth/auth-kind";
import { retiredNaverIdMarker } from "@/lib/auth/naver-session-helpers";
import { unlinkAuthIdentities } from "@/lib/auth/unlink-identities";
import { T } from "@/lib/supabase/tables";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** 회원 탈퇴: 익명화 + withdrawn + Auth 이메일 해제·ban */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return jsonError("로그인이 필요합니다.", 401);

  let body: { password?: string; confirmText?: string } = {};
  try {
    body = await request.json();
  } catch {
    return jsonError("요청 형식이 올바르지 않습니다.", 400);
  }

  const admin = createAdminClient();
  const { data: member, error: memberError } = await admin
    .from(T.members)
    .select("id, role, status, nickname")
    .eq("id", user.id)
    .maybeSingle();

  if (memberError || !member) {
    return jsonError("회원 정보를 찾을 수 없습니다.", 404);
  }

  if (member.role === "admin") {
    return jsonError("관리자 계정은 탈퇴할 수 없습니다. 다른 관리자에게 문의해 주세요.", 403);
  }

  if (member.status === "withdrawn") {
    return jsonError("이미 탈퇴한 계정입니다.", 400);
  }

  // JWT identities가 email로 보이는 네이버 계정이 있어 Auth 전체 유저로 다시 판별한다.
  const { data: authUserData } = await admin.auth.admin.getUserById(user.id);
  const requirePassword = hasEmailPasswordAuth(authUserData?.user ?? user);

  if (requirePassword) {
    const password = typeof body.password === "string" ? body.password : "";
    if (!password) return jsonError("비밀번호를 입력해 주세요.", 400);
    if (!user.email) return jsonError("이메일 정보를 확인할 수 없습니다.", 400);

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) return jsonError("서버 설정 오류입니다.", 500);

    const verifier = createSupabaseClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { error: verifyError } = await verifier.auth.signInWithPassword({
      email: user.email,
      password
    });
    if (verifyError) {
      return jsonError("비밀번호가 올바르지 않습니다.", 403);
    }
  } else {
    const confirmText = typeof body.confirmText === "string" ? body.confirmText.trim() : "";
    if (confirmText !== WITHDRAW_CONFIRM_TEXT) {
      return jsonError(`확인을 위해 "${WITHDRAW_CONFIRM_TEXT}"를 입력해 주세요.`, 400);
    }
  }

  const shortId = user.id.replace(/-/g, "").slice(0, 12);
  const anonNickname = `deleted_${shortId}`;
  const anonEmail = `deleted_${user.id.replace(/-/g, "")}@withdrawn.local`;

  // 공개 버킷의 프로필 이미지 원본도 함께 제거해야 한다. 먼저 삭제 대상을 확인하고,
  // 실제 파일 제거는 필수 DB 정리가 성공한 뒤 수행한다.
  const avatarBucket = admin.storage.from("avatars");
  const { data: avatarObjects, error: listAvatarError } = await avatarBucket.list(user.id, {
    limit: 100
  });

  if (listAvatarError) {
    return jsonError("프로필 이미지 삭제 준비에 실패했습니다. 잠시 후 다시 시도해 주세요.", 500);
  }

  const avatarPaths = (avatarObjects ?? [])
    .filter((object) => object.id !== null)
    .map((object) => `${user.id}/${object.name}`);

  // members 먼저 (withdrawn 제약 미적용 시 여기서 실패 → Auth 미변경)
  const { error: updateMemberError } = await admin
    .from(T.members)
    .update({
      status: "withdrawn",
      nickname: anonNickname,
      phone: null,
      avatar_url: null,
      gender: "undisclosed",
      age_group: null,
      suspended_reason: null,
      suspended_at: null,
      suspended_by: null
    })
    .eq("id", user.id);

  if (updateMemberError) {
    const hint = /check constraint|members_status/i.test(updateMemberError.message)
      ? " (Supabase에서 schema-withdrawn.sql 을 실행해 주세요)"
      : "";
    return jsonError((updateMemberError.message || "회원 정보 처리에 실패했습니다.") + hint, 500);
  }

  // tb_post는 작성 당시 닉네임을 별도 문자열로 보관하므로 회원 닉네임 변경만으로는
  // 기존 화면이 익명화되지 않는다. 해당 사용자의 저장된 작성자명도 함께 바꾼다.
  const { error: anonymizePostsError } = await admin
    .from(T.boardPosts)
    .update({ writer_nm: anonNickname })
    .eq("writer_id", user.id);

  if (anonymizePostsError) {
    await supabase.auth.signOut();
    return jsonError("게시글 작성자 정보 익명화에 실패했습니다. 운영팀에 문의해 주세요.", 500);
  }

  const [
    { error: resetPreferencesError },
    { error: deleteFavoritesError },
    { error: deletePlaceLikesError },
    { error: deleteCourseLikesError },
    { error: deletePostLikesError }
  ] = await Promise.all([
    admin.from(T.userPreferences).upsert(
      {
        user_id: user.id,
        accessibility_needs: [],
        theme_preferences: [],
        dark_mode: false,
        high_contrast: false,
        font_scale: 100,
        read_aloud: false
      },
      { onConflict: "user_id" }
    ),
    admin.from(T.userFavorites).delete().eq("user_id", user.id),
    admin.from(T.placeLikes).delete().eq("user_id", user.id),
    admin.from(T.courseLikes).delete().eq("user_id", user.id),
    admin.from(T.postLikes).delete().eq("user_id", user.id)
  ]);

  if (resetPreferencesError) {
    await supabase.auth.signOut();
    return jsonError("개인 설정 초기화에 실패했습니다. 운영팀에 문의해 주세요.", 500);
  }
  if (deleteFavoritesError) {
    await supabase.auth.signOut();
    return jsonError("즐겨찾기 삭제에 실패했습니다. 운영팀에 문의해 주세요.", 500);
  }
  if (deletePlaceLikesError) {
    await supabase.auth.signOut();
    return jsonError("장소 좋아요 삭제에 실패했습니다. 운영팀에 문의해 주세요.", 500);
  }
  if (deleteCourseLikesError) {
    await supabase.auth.signOut();
    return jsonError("코스 좋아요 삭제에 실패했습니다. 운영팀에 문의해 주세요.", 500);
  }
  if (deletePostLikesError) {
    await supabase.auth.signOut();
    return jsonError("게시글 좋아요 삭제에 실패했습니다. 운영팀에 문의해 주세요.", 500);
  }

  if (avatarPaths.length > 0) {
    const { error: removeAvatarError } = await avatarBucket.remove(avatarPaths);
    if (removeAvatarError) {
      await supabase.auth.signOut();
      return jsonError("프로필 이미지 삭제에 실패했습니다. 운영팀에 문의해 주세요.", 500);
    }
  }

  // 카카오·구글 identity가 남으면 재로그인 시 이 탈퇴 계정에 묶여 가입이 실패한다.
  const { error: unlinkError } = await unlinkAuthIdentities(user.id);
  if (unlinkError) {
    await supabase.auth.signOut();
    return jsonError("소셜 연동 해제에 실패했습니다. 운영팀에 문의해 주세요.", 500);
  }

  const { error: authError } = await admin.auth.admin.updateUserById(user.id, {
    email: anonEmail,
    ban_duration: "876000h",
    user_metadata: {
      nickname: anonNickname,
      phone: null,
      avatar_url: null,
      picture: null,
      name: null,
      full_name: null,
      theme_preferences: [],
      accessibility_needs: [],
      naver_id: retiredNaverIdMarker(user.id),
      withdrawn: true
    }
  });

  if (authError) {
    // DB는 이미 탈퇴 상태이므로 Auth 갱신이 실패해도 현재 브라우저 세션은 즉시 종료한다.
    await supabase.auth.signOut();
    return jsonError("계정 비활성화에 실패했습니다. 운영팀에 문의해 주세요.", 500);
  }

  await supabase.auth.signOut();

  return NextResponse.json({ ok: true });
}
