import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const routeSource = await readFile(new URL("./route.ts", import.meta.url), "utf8");

test("회원 탈퇴 시 공개 프로필 이미지 파일을 스토리지에서 제거한다", () => {
  assert.match(routeSource, /storage\.from\(["']avatars["']\)/u);
  assert.match(routeSource, /avatarBucket\.list\(user\.id/u);
  assert.match(routeSource, /avatarBucket\.remove\(avatarPaths\)/u);
});

test("회원 탈퇴 시 기존 게시글의 저장된 작성자명도 익명화한다", () => {
  assert.match(routeSource, /from\(T\.boardPosts\)[\s\S]*writer_nm:\s*anonNickname/u);
  assert.match(routeSource, /eq\(["']writer_id["'],\s*user\.id\)/u);
});

test("회원 탈퇴 데이터 정리 오류를 무시하지 않는다", () => {
  for (const errorName of [
    "resetPreferencesError",
    "deleteFavoritesError",
    "deletePlaceLikesError",
    "deleteCourseLikesError",
    "deletePostLikesError"
  ]) {
    assert.match(routeSource, new RegExp(`if \\(${errorName}\\)`, "u"));
  }
});

test("회원 탈퇴 시 게시글 좋아요 기록도 삭제한다", () => {
  assert.match(routeSource, /from\(T\.postLikes\)\.delete\(\)\.eq\(["']user_id["'],\s*user\.id\)/u);
});

test("탈퇴 상태가 된 뒤 오류가 나도 현재 세션을 종료한다", () => {
  assert.match(
    routeSource,
    /if \(authError\)[\s\S]*await supabase\.auth\.signOut\(\)[\s\S]*return jsonError/u
  );
});

test("소셜 계정 탈퇴는 비밀번호가 아니라 확인 문구로 판별한다", () => {
  assert.match(routeSource, /hasEmailPasswordAuth\(authUserData\?\.user \?\? user\)/u);
  assert.doesNotMatch(routeSource, /if \(user\.email\)[\s\S]*provider \?\? ["']email["']/u);
});

test("회원 탈퇴 시 소셜 identity를 해제해 같은 카카오·구글 계정으로 재가입할 수 있게 한다", () => {
  assert.match(routeSource, /unlinkAuthIdentities\(user\.id\)/u);
});

test("회원 탈퇴 시 네이버 id를 지워 같은 네이버 계정으로 바로 재가입할 수 있게 한다", () => {
  assert.match(routeSource, /naver_id:\s*retiredNaverIdMarker\(user\.id\)/u);
});
