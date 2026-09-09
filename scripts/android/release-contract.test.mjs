import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  findTrackedAndroidReleaseSecrets,
  readAndroidProjectContract,
  validateAndroidReleaseContract
} from "./release-contract.mjs";

const PROJECT_ROOT = fileURLToPath(new URL("../../", import.meta.url));

const VALID_SHA256_FINGERPRINT =
  "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99";
const PLAY_CLASSICAL_SIGNING_FINGERPRINT =
  "50:D8:F3:CA:1A:41:73:30:13:84:0E:21:23:72:7C:1C:9B:3D:73:35:0C:DD:D1:34:01:CA:B4:54:38:5B:4E:57";
const PLAY_QUANTUM_READY_SIGNING_FINGERPRINT =
  "AB:54:5D:67:99:AF:7C:71:65:97:EA:D8:C2:16:FE:73:A6:C2:1F:01:74:1A:8A:51:82:A8:98:A0:04:06:B8:7C";
const UPLOAD_SIGNING_FINGERPRINT =
  "8A:E2:7B:BB:05:05:25:AB:A6:60:85:75:9F:E4:08:D1:C4:E1:E7:7A:7B:9C:DE:B1:46:0E:73:9E:E1:0C:0B:0C";
const CHROME_PACKAGE = "com.android.chrome";
const ANDROID_BROWSER_HELPER_VERSION = "2.7.2";

const validContract = {
  twaManifest: {
    host: "dadaeyu.vercel.app",
    packageId: "com.dadaeyou.app",
    versionCode: 4,
    versionName: "1.0.2",
    signingKeyPath: "../../private/android-signing/dadaeyu-upload.jks",
    fingerprints: [VALID_SHA256_FINGERPRINT]
  },
  androidGradle: {
    applicationId: "com.dadaeyou.app",
    versionCode: 4,
    versionName: "1.0.2",
    compileSdk: 36,
    targetSdk: 36,
    minSdk: 23,
    browserHelperVersion: ANDROID_BROWSER_HELPER_VERSION
  },
  androidManifest: {
    launchingBrowser: CHROME_PACKAGE,
    launchingBrowserName: "Chrome"
  },
  assetLinks: [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.dadaeyou.app",
        sha256_cert_fingerprints: [
          PLAY_CLASSICAL_SIGNING_FINGERPRINT,
          PLAY_QUANTUM_READY_SIGNING_FINGERPRINT,
          UPLOAD_SIGNING_FINGERPRINT
        ]
      }
    }
  ]
};

test("Android release contract reports every TWA launch contract drift", () => {
  assert.deepEqual(validateAndroidReleaseContract(validContract), []);

  const errors = validateAndroidReleaseContract({
    twaManifest: {
      host: "example.com",
      packageId: "com.example.app",
      versionCode: 5,
      versionName: "2.0.0",
      signingKeyPath: "android-twa/dadaeyu-upload.jks"
    },
    androidGradle: {
      applicationId: "com.example.app",
      versionCode: 5,
      versionName: "2.0.0",
      compileSdk: 35,
      targetSdk: 35,
      minSdk: 21
    },
    androidManifest: {},
    assetLinks: [
      {
        relation: ["delegate_permission/common.get_login_creds"],
        target: {
          namespace: "web",
          package_name: "com.example.app",
          sha256_cert_fingerprints: ["not-a-sha256-fingerprint"]
        }
      }
    ]
  });

  assert.deepEqual(errors, [
    "Expected TWA host dadaeyu.vercel.app, received example.com.",
    "Expected Android package com.dadaeyou.app, received com.example.app.",
    "Expected versionCode 4, received 5.",
    "Expected versionName 1.0.2, received 2.0.0.",
    "Expected signing key path ../../private/android-signing/dadaeyu-upload.jks, received android-twa/dadaeyu-upload.jks.",
    "Expected Gradle applicationId com.dadaeyou.app, received com.example.app.",
    "Expected Gradle versionCode 4, received 5.",
    "Expected Gradle versionName 1.0.2, received 2.0.0.",
    "Expected compileSdk 36, received 35.",
    "Expected targetSdk 36, received 35.",
    "Expected minSdk 23, received 21.",
    `Expected Android Browser Helper ${ANDROID_BROWSER_HELPER_VERSION}, received undefined.`,
    `Expected TWA browser ${CHROME_PACKAGE}, received undefined.`,
    "Expected TWA browser name Chrome, received undefined.",
    "Expected assetlinks[0].relation to include delegate_permission/common.handle_all_urls.",
    "Expected assetlinks[0].target.namespace android_app, received web.",
    "Expected assetlinks[0].target.package_name com.dadaeyou.app, received com.example.app.",
    "Expected assetlinks[0].target.sha256_cert_fingerprints to contain SHA-256 fingerprints."
  ]);
});

test("Android release contract rejects a missing active Play app signing certificate", () => {
  const missingClassicalSigningKey = structuredClone(validContract);
  missingClassicalSigningKey.assetLinks[0].target.sha256_cert_fingerprints = [
    PLAY_QUANTUM_READY_SIGNING_FINGERPRINT,
    UPLOAD_SIGNING_FINGERPRINT
  ];

  assert.deepEqual(validateAndroidReleaseContract(missingClassicalSigningKey), [
    `Expected assetlinks[0].target.sha256_cert_fingerprints to include active Play signing fingerprint ${PLAY_CLASSICAL_SIGNING_FINGERPRINT}.`
  ]);
});

test("Android release contract rejects a missing upload signing certificate", () => {
  const missingUploadSigningKey = structuredClone(validContract);
  missingUploadSigningKey.assetLinks[0].target.sha256_cert_fingerprints = [
    PLAY_CLASSICAL_SIGNING_FINGERPRINT,
    PLAY_QUANTUM_READY_SIGNING_FINGERPRINT
  ];

  assert.deepEqual(validateAndroidReleaseContract(missingUploadSigningKey), [
    `Expected assetlinks[0].target.sha256_cert_fingerprints to include active Play signing fingerprint ${UPLOAD_SIGNING_FINGERPRINT}.`
  ]);
});

test("generated Android project matches the TWA package, version, and SDK contract", () => {
  const contract = readAndroidProjectContract(PROJECT_ROOT);

  assert.deepEqual(contract.twaManifest, {
    host: "dadaeyu.vercel.app",
    packageId: "com.dadaeyou.app",
    versionCode: 4,
    versionName: "1.0.2",
    signingKeyPath: "../../private/android-signing/dadaeyu-upload.jks",
    fingerprints: [
      PLAY_CLASSICAL_SIGNING_FINGERPRINT,
      PLAY_QUANTUM_READY_SIGNING_FINGERPRINT,
      UPLOAD_SIGNING_FINGERPRINT
    ]
  });
  assert.deepEqual(contract.androidGradle, {
    applicationId: "com.dadaeyou.app",
    versionCode: 4,
    versionName: "1.0.2",
    compileSdk: 36,
    targetSdk: 36,
    minSdk: 23,
    browserHelperVersion: ANDROID_BROWSER_HELPER_VERSION
  });
  assert.deepEqual(contract.androidManifest, {
    launchingBrowser: CHROME_PACKAGE,
    launchingBrowserName: "Chrome"
  });
});

test("tracked Android project and Digital Asset Links satisfy the release contract", () => {
  const contract = readAndroidProjectContract(PROJECT_ROOT);

  assert.deepEqual(validateAndroidReleaseContract(contract), []);
  assert.deepEqual(
    contract.twaManifest.fingerprints,
    contract.assetLinks[0].target.sha256_cert_fingerprints
  );
  assert.deepEqual(findTrackedAndroidReleaseSecrets(PROJECT_ROOT), []);
  assert.equal(
    execFileSync("git", ["check-ignore", "private/android-release/checksums.sha256"], {
      cwd: PROJECT_ROOT,
      encoding: "utf8"
    }).trim(),
    "private/android-release/checksums.sha256"
  );
});
