# CLAUDE.md — Screenshot Organizer

Mobile app (Android first, iOS second) that finds the user's screenshots, runs OCR on-device,
extracts links / dates / tasks, groups by topic, and lets the user search them (full-text first,
semantic later). Everything is processed locally. No backend in v1.

## 0. Assumptions (edit if wrong)

- Android first, iOS after Android milestones are green.
- UI languages: ru, en. Screenshot text languages that must work: **ru, en, pl**.
- Single developer, solo project, no accounts, no sync in v1.

## 1. Non-negotiable rules

1. **Never say a task is done until you ran its verification commands and they passed.**
   Report what you ran and the result. If you could not run something, say exactly that.
2. **Do not invent** APIs, package names, versions, flags or config keys. Check the installed
   package (`node_modules`, `--help`, official docs). If unsure, write a minimal spike first.
3. **Small, targeted changes.** No broad rewrites, no unrelated refactors, no new dependencies
   without a one-line justification in the commit message.
4. **Never skip, delete, or weaken a test to make it pass.** Fix the cause.
5. **Commit after every green step** (conventional commits). Never commit a red build.
6. **Stuck rule:** same error after 2 different fix attempts → stop, write findings to
   `docs/BLOCKERS.md` (what you tried, exact error, hypotheses), and ask the user.
7. **Privacy:** no network calls in the processing path, no analytics/crash SDKs that upload data,
   no logging of OCR text in release builds.
8. Pin exact dependency versions (no `^`/`~`). Use current stable releases; verify compatibility
   between Expo SDK, React Native and native libraries before installing.

## 2. Environment constraints (check at the start of every session)

- Run `uname -a`, `adb devices`, `node -v`. Record in `docs/STATUS.md`.
- **iOS builds need macOS + Xcode.** If not on macOS: write iOS code behind the interfaces,
  mark it `UNVERIFIED (not built)` in `docs/STATUS.md`, never claim it works.
- **No emulator / device** (`adb devices` empty): run Jest and JVM unit tests only, state clearly
  that e2e was not run.
- Use fixture screenshots for tests, never the user's real photos.

## 3. Stack

| Area | Choice |
|---|---|
| Language | TypeScript (`strict: true`) |
| App | React Native via Expo, **development build** (not Expo Go), `expo prebuild` allowed |
| Native code | Local Expo Modules: Kotlin (Android), Swift (iOS) |
| Navigation | expo-router |
| State | Zustand (keep it minimal) |
| DB | SQLite + FTS5. In M0 verify FTS5 works on-device with the chosen driver; if not, switch driver |
| Unit/integration tests | Jest, React Native Testing Library |
| E2E | Maestro (flows in `e2e/`) |
| Quality | ESLint, Prettier, `tsc --noEmit` |

## 4. Architecture

Keep pure logic free of React Native imports so it runs in plain Node under Jest.

```
src/
  core/            # pure TS, no RN imports, fully unit-tested
    extract/       # links, dates, emails, phones, tasks
    topics/        # rule-based classification (later: embeddings)
    pipeline/      # ScreenshotPipeline orchestrates the steps
    types.ts
  data/            # Repository implementation (SQLite), migrations
  platform/        # adapters over native modules
    ocr/           # OcrEngine interface + android/ios implementations + fake
    media/         # ScreenshotSource interface + implementations + fake
  ui/              # screens, components
modules/
  screenshot-ocr/  # Expo module: android (Kotlin), ios (Swift)
  screenshot-media/
tests/fixtures/    # screenshots + expected OCR text + expected extraction JSON
e2e/               # Maestro flows
docs/              # STATUS.md, BLOCKERS.md, DECISIONS.md
```

Interfaces (all have a `Fake*` implementation for tests):

```ts
interface OcrEngine { recognize(imageUri: string, langHints: string[]): Promise<OcrResult> }
interface ScreenshotSource { listScreenshots(since?: number): Promise<ScreenshotRef[]>; onNew(cb): Unsub }
interface Repository { /* upsert, getById, search(query), listByTopic, markProcessed ... */ }
```

## 5. Data model (SQLite)

- `screenshots(id TEXT PK, uri TEXT, taken_at INT, width INT, height INT, status TEXT, ocr_text TEXT, topic TEXT, processed_at INT, error TEXT)`
  - `status`: `pending | processing | done | failed`
- `entities(id INTEGER PK, screenshot_id TEXT FK, type TEXT, value TEXT, normalized TEXT, extra JSON)`
  - `type`: `link | date | email | phone | task`
- `screenshots_fts` — FTS5 virtual table over `ocr_text` (external-content or contentless, keep in sync via triggers)
- Migrations are versioned and tested (apply from empty DB, apply from previous version).

## 6. Pipeline

new/imported screenshot → `pending` → OCR → normalize text (trim, collapse whitespace,
fix hyphenation) → extract entities → classify topic → write in one transaction → `done`.
Failures set `failed` + `error`; retry with backoff; the pipeline is idempotent per screenshot id.
Process in small batches with a concurrency limit (default 2). Must never block the UI thread.

## 7. OCR requirement (important)

Text must be recognized for **ru, en, pl**.

- Android ML Kit on-device text recognition lists Latin, Chinese, Devanagari, Japanese and Korean
  scripts. Latin covers en/pl. **Cyrillic (Russian) is not in the official list I could find —
  do not assume it works.** Verify in M1 with a real Russian fixture.
- If ML Kit fails the Russian fixture: implement a second `OcrEngine` backed by Tesseract
  (e.g. an Android Tesseract wrapper with `rus`, `eng`, `pol` traineddata) and choose the engine
  per detected script. Record the decision in `docs/DECISIONS.md`.
- iOS: Apple Vision (`VNRecognizeTextRequest`). Check supported languages at runtime
  (`supportedRecognitionLanguages`) instead of hardcoding.
- Acceptance threshold for fixtures: character error rate ≤ 10% on clean UI screenshots
  (measure with a small script in `tests/ocr-accuracy`).

## 8. Extraction rules

| Entity | Rule | Notes |
|---|---|---|
| link | URL regex + bare domains with common TLDs | strip trailing punctuation, normalize scheme |
| email, phone | regex, normalize phone to digits with `+` | |
| date/time | parser supporting ru/en/pl, relative words ("завтра", "tomorrow", "jutro") resolved against `taken_at` | store ISO 8601 + original text |
| task | checkbox glyphs, "TODO", "нужно/надо", "need to", "trzeba", lines starting with an imperative verb after a bullet | keep heuristic simple and explainable |

Every rule has fixture-driven tests: `tests/fixtures/ocr-text/<case>.txt` +
`<case>.expected.json`. Add a regression fixture for every bug fixed.

## 9. Milestones and acceptance criteria

Work strictly in order. Do not start the next milestone until "Done when" is satisfied.

| # | Goal | Done when |
|---|---|---|
| M0 | Scaffold, tooling, scripts, CI-ready commands | `npm run typecheck`, `lint`, `test` pass on an empty-ish project; app launches on Android; FTS5 query works in a test |
| M1 | Android OCR spike (`screenshot-ocr` module) | Fixtures in ru/en/pl recognized; accuracy script passes threshold; decision on Russian OCR recorded |
| M2 | Import screenshots + persist | App lists screenshots from MediaStore (Android 13+ `READ_MEDIA_IMAGES`, older `READ_EXTERNAL_STORAGE`); pipeline fills DB; kill/restart keeps data; handles permission denied and "no screenshots" |
| M3 | Full-text search | Search returns correct results on fixtures incl. ru/pl diacritics; query latency < 100 ms on 5,000 synthetic rows |
| M4 | Extraction + "found items" UI | All extraction fixtures pass; tapping a link/date/task works; Maestro flow covers it |
| M5 | Polish, error states, settings | Empty/error/loading states; reprocess action; delete from app index without deleting the photo |
| M6 | iOS | Builds on macOS; Vision OCR + PhotoKit (handle limited access); same Jest suite passes; Maestro iOS flow |
| M7 | Semantic search + auto topics | Small multilingual embedding model on-device; brute-force cosine OK up to ~20k items; measured latency and APK size impact in `docs/DECISIONS.md` |

## 10. Testing strategy

1. **Unit (Jest, Node):** extractors, normalizer, classifier, pipeline with `FakeOcrEngine` and in-memory repo.
2. **Integration:** real SQLite with migrations, FTS5 queries, idempotent pipeline, failure + retry.
3. **Native:** Kotlin unit tests for non-trivial logic; instrumented test for the OCR module against fixture images.
4. **E2E (Maestro):** first run flow, grant permission, import fixtures, search, open item, deny permission.
5. **Self-check loop for every task:** write/adjust test → implement → `npm run check` → fix → commit.
   If a bug is found manually, first reproduce it with a failing test.

## 11. Commands (create in M0, keep working)

```
npm run typecheck     # tsc --noEmit
npm run lint
npm run test          # jest
npm run check         # typecheck + lint + test (must be green before every commit)
npm run android       # build + run dev build on emulator/device
npm run e2e:android   # maestro flows
npm run ocr:accuracy  # OCR fixture accuracy report
```

## 12. Platform notes

- **Android:** detect new screenshots with `ContentObserver` while the app runs and schedule
  catch-up scans with WorkManager. Handle scoped storage; never assume file paths.
- **iOS:** screenshots are identifiable via PhotoKit media subtype. Photo access may be "limited" —
  support it. **Reliable immediate background processing of new screenshots is not possible**:
  process on app open, in permitted background tasks, and via a Share Extension. Do not promise
  instant processing in the UI copy.
- Do not request permissions at launch; explain why first, then request.

## 13. Definition of done (every task)

- [ ] Code compiles, `npm run check` green
- [ ] New logic has tests; bugs have regression tests
- [ ] No TODO left without an entry in `docs/STATUS.md`
- [ ] `docs/STATUS.md` updated: what works, what is unverified, what is next
- [ ] Committed with a clear message

## 14. When to ask the user

Ask before: changing the stack, adding a backend, adding any network call, adding paid or
heavy dependencies, changing the data model after M3, or anything that conflicts with this file.
Otherwise decide, record the decision in `docs/DECISIONS.md`, and continue.