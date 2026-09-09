# Android TWA Release Notes

## Signing Boundary

Android signing files are private local material and must stay outside this repository.

Use this directory for the upload key and password file:

```text
/Users/ijehyeog/Desktop/workspace/project/dadaeyu/private/android-signing/
```

Expected private files for later release tasks:

- `dadaeyu-upload.jks` - upload keystore for `com.dadaeyou.app`
- `credentials.env` - local password variables used only by release commands

The checked-in Bubblewrap manifest uses the relative path
`../../private/android-signing/dadaeyu-upload.jks`, which resolves from
`Dadaeyou/android-twa/` to the repository sibling directory
`dadaeyu/private/android-signing/dadaeyu-upload.jks` in the normal checkout.
The two `..` segments are intentional: one leaves `android-twa/`, and the other
leaves `Dadaeyou/`. An isolated Git worktree at a different directory must pass
the absolute private key path to the Bubblewrap build command; it must not
rewrite the tracked manifest with a user-specific absolute path.

Back up the upload/update key and password offline outside Git. Losing the upload key or password can block future app updates, or require a Play upload key reset only when the app and account are eligible for that reset path. Backup copies must stay outside the repository and outside any Git-tracked directory.

Do not create real signing secrets in the repository. Do not commit keystores, password files, `local.properties`, Android SDK/JDK downloads, Gradle build directories, APKs, AABs, or APKS archives.

## Artifact Boundary

The `android-twa/` directory is the only repository location intended for the generated Trusted Web Activity Android project. Build outputs remain generated artifacts and are ignored:

- `android-twa/.gradle/`
- `android-twa/build/`
- `android-twa/app/build/`
- `android-twa/*.apk`
- `android-twa/*.aab`
- `android-twa/*.apks`
- `android-twa/*.idsig`

The signed direct-install APK and Play upload AAB are expected to be regenerated locally from the checked-in Android project and private signing directory. They are not source files.
The local `private/android-release/` path is also ignored defensively if a
checkout is ever created directly above that directory.

## Current Release Artifact

The current Play upload bundle is `1.0.2` (`versionCode 4`) and is stored outside Git:

- Play upload AAB: `/Users/ijehyeog/Desktop/workspace/project/dadaeyu/private/android-release/dadaeyu-1.0.2-vc4-com.dadaeyou.app-release.aab`

Older artifacts remain archived in the same private directory. Do not upload them for this release.

Current SHA-256 checksum:

```text
dbee5623cf20a12d30ef3a1be7eda1e2f4acd3c8e4c9d4ca49e3a9ded518f298  dadaeyu-1.0.2-vc4-com.dadaeyou.app-release.aab
```

The AAB is signed by the upload certificate whose SHA-256 fingerprint is:

```text
8A:E2:7B:BB:05:05:25:AB:A6:60:85:75:9F:E4:08:D1:C4:E1:E7:7A:7B:9C:DE:B1:46:0E:73:9E:E1:0C:0B:0C
```

The bundle contains package `com.dadaeyou.app`, `versionCode 4`, `versionName 1.0.2`, `minSdk 23`, `compileSdk 36`, and `targetSdk 36`. It uses Android Browser Helper `2.7.2` and explicitly launches the verified TWA through Chrome (`com.android.chrome`) instead of accepting an arbitrary compatible browser selected by the device.

## Install Through Play

The AAB cannot be installed directly. Upload it as a new release to a Play Console internal test track, publish the test release, and update the installed app to `versionCode 4` through Google Play. The existing `versionCode 3` installation does not contain this TWA runtime fix.

No authorized Android device was connected during this build, so the Play-installed runtime state could not be inspected with ADB.

## Production Web Prerequisite

The package-ID change updates `public/.well-known/assetlinks.json` to
`com.dadaeyou.app`. Deploy this source change before testing the new APK and
confirm that `/`, `/manifest.webmanifest`, `/sw.js`, `/offline.html`,
`/privacy`, `/account-deletion`, and `/.well-known/assetlinks.json` return the
intended content over HTTPS without redirects.

The deployed asset links file authorizes the package and all currently recorded
Play/upload SHA-256 fingerprints. Until the certificate actually used for an
installed build and the package ID are both live, the app can fall back to a
Custom Tab with browser UI instead of a verified full-screen TWA.

## Verification Contract

Before release work continues, verify the boundary with Git rather than source-only checks:

```sh
git check-ignore android-twa/dadaeyu-upload.jks
git check-ignore android-twa/local.properties
git check-ignore android-twa/app/build/outputs/apk/release/app-release.apk
git check-ignore android-twa/app-release-bundle.aab
git check-ignore android-twa/commandlinetools-mac-11076708_latest.zip
git check-ignore android-twa/jdk-17_macos-aarch64_bin.tar.gz
git check-ignore android-twa/openjdk-17.0.10_macos-aarch64_bin.tar.gz
git check-ignore android-sdk/cmdline-tools.zip
git check-ignore commandlinetools-mac-11076708_latest.zip
git check-ignore android-commandlinetools-mac.zip
git check-ignore jdk/jdk-17.zip
git check-ignore jdk-17_macos-aarch64_bin.tar.gz
git check-ignore openjdk-17.0.10_macos-aarch64_bin.tar.gz
git check-ignore private/android-signing/anything.txt
git check-ignore private/android-release/checksums.sha256
git status --short
```

`git status --short` should show only intentional source changes. It must not show private signing files, generated Android build outputs, or local SDK/JDK downloads.
