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

## M3

- **Order**: M3 before closing M1 (Russian OCR), user decision 2026-11-18. Tesseract is the next step after M3.
- **Folded search column**: schema v3 adds `screenshots.search_text`, written by the repository with
  `foldForSearch` (NFC, `ł→l`, `Ł→L`, `ё→е`, `Ё→Е`); the FTS5 index moved from `ocr_text` to `search_text`.
  Reason: FTS5 `unicode61 remove_diacritics 2` folds Latin diacritics but not `ł` (no decomposition) and not
  Cyrillic `ё` (checked by failing tests). Custom tokenizers are not available through expo-sqlite, and doing the
  replace inside FTS triggers would make `rebuild` disagree with the index. Cost: text is stored twice.
  The v3 backfill uses SQL `replace()` with the same mapping; keep both in sync if the fold changes (then add a
  migration that recomputes `search_text` and rebuilds the index).
- **`й` is not folded** to `и`: they are different letters in Russian.
- **Query building** (`buildFtsQuery`): words = Unicode letters/digits runs, lower-cased, folded, deduplicated,
  max 8, each as a quoted prefix term `"word"*`, implicit AND. All FTS5 syntax from the input is dropped, so user
  input can never produce an invalid MATCH.
- **FTS5 `prefix='2 3'`** index to keep short prefix queries cheap while typing.
- **Ranking**: `bm25()`, then `taken_at DESC`; default limit 100.
- **Debounce and races in the store**: 150 ms debounce; a sequence number lets only the newest query write
  `results`; `results = null` means "no active search", `[]` means "nothing found".
- **Latency test** runs in Jest on 5,000 deterministic synthetic rows (ru/en/pl vocabulary); it is a regression
  guard for the query shape, not an on-device measurement.

## M2

- **Data model**: v1 is the CLAUDE.md section 5 schema; v2 adds `attempts` and `next_retry_at` (retry with backoff,
  section 6). Done before M3, so no "change after M3" approval is needed. Versioned via `PRAGMA user_version`, each
  migration in its own transaction, downgrade refused; tested from empty and from v1 with data.
- **Repository over a tiny SQL port** (`SqlDb`/`RawDb`): the same `SqliteRepository` runs on expo-sqlite (device) and
  `node:sqlite` (Jest). A mutex serializes statements/transactions on the single connection, because concurrent
  pipeline workers would otherwise issue nested `BEGIN`.
- **Attempts are counted at claim time**, not on failure: an image that kills the process on every attempt is
  eventually marked failed ("Interrupted too many times") instead of crash-looping.
- **Kill recovery**: `recoverInterrupted` runs at start; `processing` rows go back to `pending`. Writing a result
  (`markProcessed`) is one transaction.
- **Pipeline**: batch of 10 claimed newest first, at most 2 OCR calls in flight, yields to the event loop between
  batches, single-flight `processPending` with a re-run flag, exponential backoff 30 s … 1 h, max 5 attempts.
- **No permission prompt at launch** (section 12): the store only reads the permission; the UI explains first and the
  system dialog is shown on the button. `blocked` (don't ask again) offers system settings; returning to the app
  re-checks the permission (`onForeground`).
- **Permissions via React Native `PermissionsAndroid`** (no `expo-media-library` dependency): `READ_MEDIA_IMAGES` on
  API 33+, `READ_EXTERNAL_STORAGE` below. Manifest entries live in the `screenshot-media` module.
- **Screenshot detection**: MediaStore `RELATIVE_PATH LIKE '%Screenshot%'` (API 29+; `DATA` before), not pending.
  Timestamp = `DATE_TAKEN`, falling back to `DATE_ADDED * 1000`.
- **New screenshots**: `ContentObserver` event → debounced JS re-scan from the last seen timestamp (idempotent upsert).
- **zustand 5.0.16** (in the CLAUDE.md stack) holds UI state; the store is framework-free (`zustand/vanilla`).
- **UI strings**: tiny ru/en dictionary (`src/ui/strings.ts`), no i18n dependency.
- **Test note**: awaiting `fireEvent.press` hangs under RNTL 14 when the press synchronously updates a
  `useSyncExternalStore` store; the index test does not await the press and waits for the visible result instead.

## M1

- **OCR spike engine: ML Kit bundled Latin** (`com.google.mlkit:text-recognition:16.0.1`), not the Play Services variant:
  the bundled model works offline and needs no runtime model download (CLAUDE.md rule 7).
- **No Cyrillic ML Kit artifact exists** on Google Maven (checked `group-index.xml`: only latin, chinese, devanagari,
  japanese, korean). **Measured:** the Latin recognizer gives CER 66.9% on ru fixtures (threshold 10%), en 0.2%, pl 0.6%.
  ML Kit is fine for en/pl; it cannot be used for Russian.
- **Russian engine (2026-11-18): Tesseract via Tesseract4Android 4.9.0** (`cz.adaptech.tesseract4android:tesseract4android`,
  JitPack, Apache-2.0, Tesseract 5.5.1). Latest tag on GitHub when chosen; coordinates from its README; API checked
  against `TessBaseAPI.java` at that tag. Standard (single-threaded) variant: one `TessBaseAPI` instance on a
  dedicated single-thread executor, because the API is not thread-safe and the pipeline runs 2 OCR calls at once.
- **Models: tessdata_fast** `rus`, `eng`, `pol` (LSTM-only, `OEM_LSTM_ONLY`, `PSM_AUTO`), bundled as APK assets and
  copied once to `filesDir/tesseract/tessdata` (temp file + rename). Bundled, not downloaded: no network in the
  processing path (rule 7). sha256: rus `e16e5e03…df225`, eng `7d4322bd…170b2`, pol `c4476cdb…f79b2`.
  Fast models first because they are ~5x smaller than `tessdata`; switch only if they fail the threshold.
- **Engine per script** (`ScriptRoutingOcrEngine`): Tesseract `rus+eng+pol` reads every screenshot; if ≥ 30% of the
  letters are Cyrillic its text is kept, otherwise ML Kit Latin (CER 0.2–0.6% on en/pl) reads it and wins.
  Tesseract first because ML Kit's output on Cyrillic is Latin look-alikes ("3ameTKM") that cannot be detected
  reliably. Cost: two OCR passes for Latin screenshots; acceptable for background processing, to be measured.
  The 30% threshold is a first guess, not tuned on data.
- Earlier proposal (kept for history): second `OcrEngine` on Tesseract (`rus+eng+pol`
  traineddata), chosen per detected script, as CLAUDE.md section 7 prescribes. Nothing has been added yet.
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
