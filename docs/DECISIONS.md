# Decisions

## M0

- **Expo SDK 58** (`expo` 58.0.22, React Native 0.88.1, React 19.3.0). It was `latest` on npm when M0 ran.
  `create-expo-app` default template was SDK 57; `default@latest` template was used instead and reduced
  to a minimal expo-router app (demo screens, web support, glass/symbols/image deps removed).
- **Exact versions everywhere** (no `^`/`~`). `npx expo install --check` and `expo-doctor` pass.
  `react-dom` 19.3.0 is pinned explicitly: it is a peer of `expo-router`, and npm otherwise installs
  19.3.1, which requires `react ^19.3.1` and breaks the tree.
- **ESLint 9.39.5, not 10**: `eslint-config-expo` pulls `eslint-plugin-import`/`-react`, which do not target ESLint 10 yet.
  Prettier is formatting only (`eslint-config-prettier` just disables conflicting rules).
- **SQLite driver: `expo-sqlite`** 58.0.15. Its Android build flags include `SQLITE_ENABLE_FTS5=1`
  (`node_modules/expo-sqlite/android/build.gradle`); same for iOS podspec. This is static evidence only,
  on-device verification is still open (see STATUS.md).
- **FTS5 test in Jest uses `node:sqlite`** (built into Node 24, no new dependency) with `@jest-environment node`.
  It validates the schema/triggers/queries, not the on-device driver. Node 24 is pinned via `.nvmrc`.
  `node:sqlite` is experimental in Node; if it changes, switch the test to `better-sqlite3`.
- **Test renderer**: `@testing-library/react-native` 14 needs `test-renderer` (not `react-test-renderer`).
- **Tests are not placed under `src/app/`** because expo-router treats every file there as a route.
  Component/screen tests live in `tests/`, pure-logic and data tests next to the code.
- **Continuous Native Generation**: `/android` and `/ios` are git-ignored and produced by `expo prebuild`.
  Local Expo modules (`modules/`) will live outside them.
- **Application id**: `com.snapshelf.app` (Android package and iOS bundle id). Placeholder, change before any release.
- **Platforms**: `android`, `ios` only (web removed).
- **Line endings**: LF enforced via `.gitattributes`.

## M1

- **OCR spike engine: ML Kit bundled Latin** (`com.google.mlkit:text-recognition:16.0.1`), not the Play Services variant:
  the bundled model works offline and needs no runtime model download (CLAUDE.md rule 7).
- **No Cyrillic ML Kit artifact exists** on Google Maven (checked `group-index.xml`: only latin, chinese, devanagari,
  japanese, korean). The Russian decision is deliberately left open until measured on a device.
- **Native API**: `ScreenshotOcr.recognize(imageUri, engine)` takes an engine id so a second engine (Tesseract) can be
  added behind the same call if needed. Unknown engine ids reject with `ERR_OCR_ENGINE`.
- **Fixtures are synthetic** (Pillow + Segoe UI, ru/en/pl, light and dark), because no real fixtures were provided.
  Reference text includes the title; status-bar text is not rendered so the reference is complete.
- **CER definition**: NFC, whitespace collapsed, case-sensitive Levenshtein over code points, aggregated per language
  weighted by reference length; threshold 10% (CLAUDE.md section 7).
- **Spike transport**: dev-only route `/ocr-spike` logs `OCR_SPIKE {json}` lines (guarded by `__DEV__`, so no OCR text
  is logged in release builds); `ocr:accuracy --adb` parses logcat.
- **Windows build**: path-length failure fixed locally by replacing SDK ninja (see STATUS.md). Repo path is long;
  a shorter checkout path would also avoid this.
