# Status

## Environment (M0 session)

- OS: Windows (PowerShell). `uname` is not available.
- `node -v`: v24.13.0, `npm -v`: 11.7.0
- `adb`: installed at `D:\Android\Sdk\platform-tools` (not on PATH). The physical Redmi Note 9S never exposed an ADB
  interface (BLOCKERS.md B1), so M1 was measured on an **x86_64 emulator** (AVD `snap34`, Android 14, google_apis,
  `ANDROID_AVD_HOME=D:\Android\avd`, WHPX acceleration). JDK 17 and Android SDK installed in M1.
- Not macOS: iOS cannot be built here.

## Milestone: M4 (extraction + "found items") — LOGIC AND UI DONE in Jest; NOT run on the emulator; Maestro NOT run

Started on the user's decision (2026-11-18) while M1 (Tesseract build + CER) and M3 (on-device check) still wait for
a Windows build. Pure TS and RN screens only: no native code, no new dependencies.

### Verified (commands run, Linux VM, Node 22.23.4, fresh `npm ci`)

- `npm run check` — typecheck, lint, **211 tests in 21 suites** pass (twice in a row); `npm run format:check` passes;
  `npx expo export --platform android` builds the bundle with the new `/screenshot/[id]` route.
- Extraction fixtures: 10 cases in `tests/fixtures/ocr-text/` (the 6 OCR reference texts + links, phones, dates,
  tasks edge cases), each `<case>.txt` + `<case>.expected.json`; every expected entity was reviewed by hand.
- Unit tests: dates in the pinned zone (Europe/Warsaw via `tests/globalSetup.js`) incl. a day boundary that differs
  from UTC, weekday on its own day, 12 AM/PM, impossible dates, status-bar clock ignored, no dates/phones inside links.
- Pipeline stores entities with the text in one transaction; reprocessing replaces them; deleting a screenshot
  cascades; task done/undone is stored in `entities.extra`.
- "Found items" screen (RNTL with a fake repository): labels, date display, recognized text, nothing-found and
  missing-screenshot states, ru strings; tapping link/email/phone/date calls `Linking.openURL` with
  `https://…`/`mailto:`/`tel:`/`content://com.android.calendar/time/<ms>`; tapping a task toggles it; an app that
  cannot be opened shows an error. Library row tap opens the screen.
- Mutation checks: breaking the task toggle fails 1 UI test; breaking the month in `localIsoToEpoch` fails 3 tests.
- Two bugs found by the fixtures and fixed before commit: a URL ending in a balanced `)` lost it; a time joined the
  nearest date instead of the date before it ("Jan 2 at 12 am, Jan 3").

### NOT verified / known gaps

- **Not run on the emulator**: whether Android opens `mailto:`, `tel:` and especially the calendar
  `content://com.android.calendar/time/<ms>` URI from `Linking.openURL` (the google_apis image may have no calendar
  app — then the screen shows "Could not open …").
- **Maestro flow `e2e/found-items.yaml` is written but was never run** (Maestro not installed; M4 "Done when" needs it).
- Screenshots processed before M4 have no entities until they are processed again (reprocess action is M5).
  The only such data is the emulator test DB: clear app data or wait for M5.
- Re-processing a screenshot resets its tasks' done state (entities are rebuilt from the text).
- Year-less dates take the screenshot's year (`12 марта` on a November screenshot → March of that year, in the past).
  Numeric dates are day-first (`12/01/2026` = 12 January). `dd.mm` without a year is not recognized.
- English imperative tasks are recognized only after a bullet; ru/pl infinitive lines count without one
  (so the Polish pangram line "Zażółć gęślą jaźń" is a task: it is an imperative).
- Library rows do not show how many items were found yet.

## Milestone: M1 — Russian OCR via Tesseract: BUILDS on Windows; CER NOT MEASURED yet

### Local run 2026-11-18 (`scripts/local-run.cmd`, Windows, emulator `snap34`, Android 14)

- `gradlew assembleDebug -PreactNativeArchitectures=x86_64` — **BUILD SUCCESSFUL in 1m 47s** with the Tesseract
  module (Tesseract4Android 4.9.0 from JitPack): the Kotlin code compiles without changes.
- **Debug APK x86_64: 121,863,538 bytes** (the ML Kit-only debug APK of 2026-10-31 was 106,456,578 bytes: +15.4 MB,
  mostly the three tessdata models and Tesseract native libs). Release/arm64 size not measured.
- The APK installed, Metro started, the dev client was launched. The run stopped after that (the script window was
  closed before any check ran), so the OCR spike, CER, M3 search and M4 taps are still NOT verified on the emulator.

### Done (verified here, Linux VM, Jest)

- `npm run check` — **168 tests in 17 suites** pass; `npm run format:check` passes; `npx expo export --platform android`
  builds the JS bundle.
- `ScriptRoutingOcrEngine` (TS): Tesseract first; text with ≥ 30% Cyrillic letters keeps the Tesseract result,
  otherwise ML Kit Latin reads the image and wins. Either engine failing falls back to the other; both failing
  throws with both reasons. Unit-tested with stub engines; `cyrillicShare` checked on all 6 fixture texts.
- `ocr:accuracy` takes `--engine <run id>` (`mlkit-latin`, `tesseract`, `routed`); log parsing/selection is unit-tested;
  re-scoring `results/mlkit-latin.json` reproduces the stored file byte-for-byte.
- Tessdata models (tessdata_fast, `main` at `87416418`) in `modules/screenshot-ocr/android/src/main/assets/tessdata/`:
  rus 3.9 MB, eng 4.1 MB, pol 4.8 MB (sha256 in DECISIONS.md).

### UNVERIFIED (not built — no Android SDK / Maven access in this session)

- Kotlin `tesseract` engine in `ScreenshotOcrModule.kt` (`cz.adaptech.tesseract4android:tesseract4android:4.9.0`
  from JitPack). API calls were checked against the library's `TessBaseAPI.java` at tag 4.9.0, but the module was
  **not compiled**. Expect possible compile fixes on the first Gradle build.
- Russian CER with Tesseract is **not measured**; M1 "Done when" is still NOT met.
- APK size impact (native libs + ~12.7 MB models) and Tesseract latency per screenshot are not measured.
- The app now always runs Tesseract first, then ML Kit for Latin screenshots: about 2 OCR passes for en/pl.

### To verify on Windows (emulator)

```
npx expo prebuild --platform android --no-install   # only if android/ is stale
cd android && gradlew assembleDebug -PreactNativeArchitectures=x86_64 && cd ..
# then the "Run the spike" steps below; the spike now runs 3 engines (~18 OCR calls)
npm run ocr:accuracy -- --adb --engine tesseract
npm run ocr:accuracy -- --adb --engine routed        # what the app uses; must pass for ru/en/pl
```

If ru still fails with tessdata_fast: try tessdata (best/legacy, ~20 MB per language) before anything else.

## Milestone: M3 (full-text search) — DONE in Jest/Node; NOT run on the emulator or a device

M1 is still open (Russian OCR). By user decision (2026-11-18) M3 was done first; Tesseract comes next.

### Verified (commands run, Linux VM, Node 22.23.4, fresh `npm ci`)

- `npm run check` — typecheck, lint, **150 tests in 15 suites** pass; `npm run format:check` passes.
- `npx expo export --platform android` — the Hermes bundle builds with the search UI.
- Search on the 6 OCR fixture reference texts (`tests/data/search.test.ts`): word/prefix/multi-word AND queries in
  ru/en/pl, incl. `zazolc gesla jazn` → `Zażółć gęślą jaźń`, `LODZIA` → `Łodzią`, `wiadomosci` → `Wiadomości`,
  `отчет` → `отчёт`, `все хорошо` → `Всё хорошо`, digits (`14:00`, `+48 501`), no-hit and no-word queries.
- Ranking (bm25, then newest), limit, reprocessing updates the index, only processed rows are searchable.
- Migration v2 → v3 with data: existing text is backfilled, folded and searchable; v1 → v3 still works.
- **Latency: 5,000 synthetic multilingual rows, 10 queries incl. 2-letter prefixes: worst 8–19 ms** (budget 100 ms,
  `tests/data/searchPerf.test.ts`). Node's bundled SQLite on a desktop CPU, not expo-sqlite on a phone.
- Store: debounce (150 ms), only the newest query may write results, empty input clears the search, the active
  search refreshes when new screenshots are processed. UI: search box (shown once the library has items), results
  replace the list, result count (ru plurals), "nothing found", clear button, no "nothing found" while a query runs.
- Mutation checks: removing the stale-result guard fails 1 store test; removing `ł` folding fails 8 search tests.

### NOT verified / known gaps

- **Not run on the emulator or a device in this session** (the session ran in a Linux VM without Android SDK).
  To verify: rebuild the dev client, open the app, type into the search box. Migration v3 on the existing
  emulator DB (v2 with 30 rows) is covered by the Jest upgrade test only.
- On-device query latency is not measured (expected to be higher than in Node; budget leaves ~5x headroom).
- Russian text is still garbage from ML Kit Latin, so Russian search only works on the fixtures/tests until the
  Tesseract engine lands (M1).
- No match highlighting in results; snippet is still the first 140 chars of the text.
- `й`/`и` are kept distinct on purpose; other Cyrillic letters are not folded.
- Observed once: under a cold Jest cache `tests/ui/LibraryScreen.test.tsx` failed one test with a timeout in a
  full parallel run, then passed 4 runs in a row. Not reproduced; watch for flakiness.

## Milestone: M2 (import + persist) — DONE on the emulator; M1 is still open

M2 was started on the user's explicit request although M1's "Done when" is not met (Russian OCR fails the 10% CER
threshold, see M1 below). The pipeline takes the OCR engine through `OcrEngine`, so a Russian-capable engine can be
swapped in later. Until then Russian screenshots are stored with garbage text (ML Kit Latin).

### Verified (commands run)

- `npm run check` — typecheck, lint, **97 tests in 12 suites** pass; `npm run format:check` passes.
- Mutation check: breaking the concurrency limit and `recoverInterrupted` makes 6 tests fail; reverted.
- `gradlew assembleDebug -PreactNativeArchitectures=x86_64` — builds with the new `screenshot-media` module; merged
  manifest has `READ_MEDIA_IMAGES` and `READ_EXTERNAL_STORAGE` (maxSdkVersion 32).
- On the x86_64 emulator (Android 14, API 34), debug build + Metro, driven with `adb` / `uiautomator`:
  - Launch: the explanation card is shown, **no system dialog at launch**.
  - Permission denied once → "Access was not granted" + "Try again"; denied twice ("Don't allow") → blocked card;
    "Open settings" opens the system app settings; `pm grant` while the app is in the background, then returning →
    permission is detected and the library syncs (foreground re-check).
  - No screenshots (only a non-screenshot image in `/sdcard`): empty state "No screenshots yet".
  - 6 fixtures pushed to `Pictures/Screenshots` while the app was open: picked up by the ContentObserver, processed
    ("Processed 6 of 6"). `Pictures/Other/holiday.png` was correctly ignored.
  - Kill/restart: 24 more screenshots, `am force-stop` at ~16 of 30. DB pulled right after the kill: 18 done, 4 pending,
    8 processing (schema v2). After restart: **30 done, 30 distinct ids, 0 empty texts**; the 8 interrupted rows have
    `attempts=2`, the other 22 `attempts=1`; FTS finds the text (`notifications` 7 hits, `lista` 7 hits, as expected).

### NOT verified / known gaps

- No physical device (the Redmi never exposed ADB). Timing and UI smoothness on real hardware are unknown.
- "Never blocks the UI thread" is by design only: ML Kit runs on its own thread, SQLite through expo-sqlite's async
  API, the pipeline yields to the event loop between batches (tested with timers). No frame-time/jank measurement.
- Android < 13 (`READ_EXTERNAL_STORAGE`, `DATA LIKE` query) path: permission mapping is unit-tested, the query was not
  run on an API < 29/33 device.
- Android 14 "Select photos and videos" (partial access) is offered by the system dialog; choosing it does not grant
  full access, so the app keeps treating the permission as not granted. Partial access is not supported yet.
- Screenshot detection is by folder name (`RELATIVE_PATH LIKE '%Screenshot%'`), which fits Pixel/Samsung/Xiaomi but not
  every vendor or locale.
- No WorkManager catch-up scans (CLAUDE.md section 12): new screenshots are found while the process is alive and on the
  next foreground/start scan.
- The list shows the newest 200 screenshots (no pagination yet); screenshots deleted from the gallery are not removed
  from the index (M5).
- Large library (thousands of screenshots) not measured.
- Maestro e2e flow not written (M4 covers e2e).
- Finding for M3: FTS5 `remove_diacritics` does not fold Polish `ł`. **Resolved in M3** (folded `search_text`).

## Milestone: M1 (Android OCR spike) — ML Kit MEASURED; Russian FAILS with ML Kit (Tesseract: see above)

### ML Kit (bundled Latin, 16.0.1) results — emulator, 6 synthetic fixtures

| Language | CER                                                  | Threshold 10% |
| -------- | ---------------------------------------------------- | ------------- |
| ru       | 66.9% (347/519 chars; ru-notes 61.0%, ru-chat 72.9%) | FAIL          |
| en       | 0.2% (1/506; en-article 0.3%, en-settings 0.0%)      | PASS          |
| pl       | 0.6% (3/467; pl-todo 0.9%, pl-message 0.4%)          | PASS          |

Russian output is Latin-lookalike transliteration (e.g. "Заметки" -> "3ameTKM"). Latency about 0.8–1.6 s per
1080x2400 image on the emulator (first call 1.55 s). Raw results: `tests/ocr-accuracy/results/mlkit-latin.json`.

### Done (verified)

- Fixtures: `tests/fixtures/screenshots/` — 6 synthetic screenshots (ru x2, en x2, pl x2) with
  `<case>.expected.txt` (reference text incl. the title). Generated by `tests/fixtures/generate_fixtures.py`.
- `modules/screenshot-ocr` (Kotlin, ML Kit bundled Latin recognizer 16.0.1). Builds and runs on the emulator
  (`gradlew assembleDebug -PreactNativeArchitectures=x86_64`).
- `OcrEngine`, `FakeOcrEngine`, `MlKitLatinOcrEngine`, dev-only spike screen `src/app/ocr-spike.tsx`.
- `tests/ocr-accuracy`: CER (whitespace-collapsed Levenshtein), per-language aggregation, `npm run ocr:accuracy`.
- `npm run check` green (4 suites, 11 tests).

### NOT done / unverified

- **Russian OCR**: Tesseract engine written (see the Tesseract section above), not built or measured yet.
- Measured on an emulator only, not on a physical device. The ML Kit model is the same, but timing is not representative.
- Instrumented (androidTest) test of the module: not written.
- Fixtures are synthetic (Segoe UI, clean, 6 images). Real screenshots may score worse; ru has only 519 reference chars.
- M1 "Done when" is NOT satisfied: the Russian engine exists in code but is not built or measured.

### Build environment (this machine)

- JDK: Microsoft OpenJDK 17.0.21 (`C:\Program Files\Microsoft\jdk-17.0.21.21-hotspot`).
- Android SDK: `D:\Android\Sdk` (C: has only 16 GB). platform 36, build-tools 36.0.0, NDK 27.1.12297006, CMake 3.22.1.
- Env vars needed for Gradle: `JAVA_HOME`, `ANDROID_HOME=D:\Android\Sdk`.
- SDK's CMake 3.22.1 `ninja.exe` (1.10.2) was replaced with ninja 1.13.2 (backup `ninja.1.10.2.bak`): the old one fails
  with "Filename longer than 260 characters" on `react-native-gesture-handler` codegen objects. Not a repo change.

### Works (verified, commands run)

- `npm run typecheck` — passes
- `npm run lint` — passes
- `npm run test` — 2 suites, 4 tests pass (FTS5 via `node:sqlite`; index screen render via RNTL)
- `npm run check` — passes
- `npm run format:check` — passes
- `npm run ocr:accuracy` — reads logcat/results, per-language CER (see M1 table)
- `npx expo install --check` — dependencies up to date; `npx expo-doctor` — 20/20 checks passed
- `npx expo export --platform android` — Metro/Hermes bundle builds
- `npx expo prebuild --platform android --no-install` — generates the Android project without warnings

### UNVERIFIED (could not run here)

- **App launch on Android**: the debug build installs and launches on the x86_64 emulator (dev client + Metro, the
  `/ocr-spike` route ran). Not verified on a physical device.
- **FTS5 on-device with `expo-sqlite`**: partly closed in M2. The schema with the FTS5 table and triggers was created by
  expo-sqlite on the emulator and the index returned hits when the DB was read back on the host. Search queries
  and latency inside the app are still unverified (M3).
- `npm run e2e:android`: Maestro not installed, no flows exist yet (`e2e/` is empty).
- **iOS**: `UNVERIFIED (not built)`; nothing iOS-specific written yet.

### Open items

- `npm audit` reports vulnerabilities in transitive dev/Expo tooling dependencies; not addressed.
- Application id `com.snapshelf.app` is a placeholder.

### Run the spike (emulator or device)

```
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
adb push tests\fixtures\screenshots\. /data/local/tmp/fx/
adb shell "run-as com.snapshelf.app mkdir -p files/fixtures && run-as com.snapshelf.app sh -c 'cp /data/local/tmp/fx/*.png files/fixtures/'"
adb reverse tcp:8081 tcp:8081
npx expo start --dev-client                      # keep running
adb logcat -c
adb shell am start -a android.intent.action.VIEW -d "exp+snapshelf://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
adb shell am start -a android.intent.action.VIEW -d "snapshelf:///ocr-spike"
npm run ocr:accuracy -- --adb --engine routed    # after OCR_SPIKE_DONE appears in logcat
```

(`/sdcard/Android/data/...` does not work: files pushed by `shell` are not readable by the app, EACCES.)

### Next

1. On Windows: build with Tesseract, fix compile errors if any, run the spike, `ocr:accuracy --engine routed`.
   Close M1 if ru/en/pl pass; record APK size and per-image latency in DECISIONS.md.
2. Verify M3 on the emulator (search in the app, v2 → v3 migration on the old DB).
3. On Windows: verify M4 on the emulator (open a screenshot, tap link/email/phone/date/task), install Maestro and
   run `npm run e2e:android`; then M4 is done.
4. M5: polish, error states, settings, reprocess action (also fills entities for pre-M4 screenshots).
