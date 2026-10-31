# Status

## Environment (M0 session)

- OS: Windows (PowerShell). `uname` is not available.
- `node -v`: v24.13.0, `npm -v`: 11.7.0
- `adb`: **not installed**. No emulator/device. No JDK, no `ANDROID_HOME`/Android SDK.
- Not macOS: iOS cannot be built here.

## Milestone: M0 (scaffold)

### Works (verified, commands run)

- `npm run typecheck` — passes
- `npm run lint` — passes
- `npm run test` — 2 suites, 4 tests pass (FTS5 via `node:sqlite`; index screen render via RNTL)
- `npm run check` — passes
- `npm run format:check` — passes
- `npm run ocr:accuracy` — runs, placeholder only (no fixtures until M1)
- `npx expo install --check` — dependencies up to date; `npx expo-doctor` — 20/20 checks passed
- `npx expo export --platform android` — Metro/Hermes bundle builds
- `npx expo prebuild --platform android --no-install` — generates the Android project without warnings

### UNVERIFIED (could not run here)

- **App launch on Android** (`npm run android`): no JDK, Android SDK, emulator or device. Gradle build never ran.
- **FTS5 on-device with `expo-sqlite`**: only the build flags were checked statically; the Jest test uses Node's SQLite.
- `npm run e2e:android`: Maestro not installed, no flows exist yet (`e2e/` is empty).
- **iOS**: `UNVERIFIED (not built)`; nothing iOS-specific written yet.

### Open items

- `npm run ocr:accuracy` is a placeholder (replace in M1).
- `npm audit` reports vulnerabilities in transitive dev/Expo tooling dependencies; not addressed.
- Application id `com.snapshelf.app` is a placeholder.

### Next

- Install JDK + Android SDK, run `npm run android` once to close the M0 "app launches" criterion and the on-device FTS5 check.
- Then M1: Android OCR spike (`modules/screenshot-ocr`), ru/en/pl fixtures, Russian OCR decision.
