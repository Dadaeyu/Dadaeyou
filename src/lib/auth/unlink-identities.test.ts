import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  identityUuidCandidates,
  isSocialAuthIdentity,
  socialIdentitiesOf,
  socialIdentityUuid,
  withdrawnPlaceholderEmail
} from "./unlink-identities-helpers.ts";

const source = await readFile(new URL("./unlink-identities.ts", import.meta.url), "utf8");
const helperSource = await readFile(
  new URL("./unlink-identities-helpers.ts", import.meta.url),
  "utf8"
);

test("카카오·구글 identity만 소셜로 보고 이메일·전화번호는 남긴다", () => {
  assert.equal(isSocialAuthIdentity({ provider: "kakao" }), true);
  assert.equal(isSocialAuthIdentity({ provider: "google" }), true);
  assert.equal(isSocialAuthIdentity({ provider: "email" }), false);
  assert.equal(isSocialAuthIdentity({ provider: "phone" }), false);
  assert.deepEqual(
    socialIdentitiesOf({
      identities: [
        { provider: "email", identity_id: "11111111-1111-1111-1111-111111111111" },
        { provider: "kakao", identity_id: "22222222-2222-2222-2222-222222222222" }
      ]
    }),
    [{ provider: "kakao", identity_id: "22222222-2222-2222-2222-222222222222" }]
  );
});

test("헬퍼는 카카오 provider_id를 identity UUID로 오인하지 않는다", () => {
  assert.match(helperSource, /identity_id/u);
  assert.match(helperSource, /provider_id/u);
});

test("삭제 경로에는 identity_id UUID만 쓰고 카카오 provider_id는 쓰지 않는다", () => {
  assert.equal(
    socialIdentityUuid({
      identity_id: "22222222-2222-2222-2222-222222222222",
      id: "1234567890"
    }),
    "22222222-2222-2222-2222-222222222222"
  );
  assert.equal(socialIdentityUuid({ identity_id: "1234567890", id: "1234567890" }), null);
  assert.equal(socialIdentityUuid({ id: "1234567890" }), null);
  assert.equal(
    socialIdentityUuid({ id: "22222222-2222-2222-2222-222222222222" }),
    "22222222-2222-2222-2222-222222222222"
  );
  assert.deepEqual(
    identityUuidCandidates({
      identity_id: "1234567890",
      id: "22222222-2222-2222-2222-222222222222"
    }),
    ["22222222-2222-2222-2222-222222222222"]
  );
});

test("탈퇴 계정 자리표시 이메일은 사용자 id로 고유하다", () => {
  const userId = "6aa5d0d4-2a9f-4483-b6c8-0cf4c6c98ac4";
  assert.equal(
    withdrawnPlaceholderEmail(userId),
    "deleted_6aa5d0d42a9f4483b6c80cf4c6c98ac4@withdrawn.local"
  );
});

test("identity 삭제 404를 성공으로 처리하지 않는다", () => {
  assert.doesNotMatch(source, /response\.ok \|\| response\.status === 404/u);
  assert.match(source, /if \(response\.ok\)/u);
});

test("마지막 소셜 identity를 지우기 전에 이메일 identity를 붙인다", () => {
  assert.match(source, /email_confirm:\s*true/u);
  assert.match(source, /ensurePlaceholderEmailIdentity/u);
});

test("DELETE가 막히면 Auth 사용자를 soft-delete 해 provider_id를 비식별화한다", () => {
  assert.match(source, /deleteUser\(userId,\s*true\)/u);
});

test("활성 계정에서는 지정한 소셜 identity만 뗀다", () => {
  assert.match(source, /export async function unlinkProviderIdentities/u);
  assert.match(source, /wanted\.has\(identity\.provider/u);
});
