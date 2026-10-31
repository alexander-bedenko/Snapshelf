# Blockers

## B1 — M1: no ADB access to the test device, ML Kit not measured (open)

**Needed:** run the ML Kit (Latin) recognizer on the ru/en/pl fixtures on a real device and compute CER.

**State:** debug APK builds (`android/app/build/outputs/apk/debug/app-debug.apk`, arm64-v8a, 101 MB).
`adb devices` stays empty.

**What was tried**

1. User connected a Redmi Note 9S and enabled USB debugging. `adb devices` empty.
2. `adb kill-server` / `start-server`, polled 30 s. Empty.
3. User replugged the cable and rechecked the toggle. Empty.

**Exact observation:** Windows lists only `WPD  Redmi Note 9S  USB\VID_2717&PID_FF40\90BB76F` (MTP).
PID changed `FF10` -> `FF40` between checks. No device with an ADB interface and no device in an error
state, so this is not a missing-driver symptom: the phone is not exposing ADB at all.

**Hypotheses**

- USB debugging not actually active on the phone (MIUI: needs re-toggle after switching USB mode;
  "USB debugging (Security settings)" and "Install via USB" also need to be on for `adb install`).
- Charge-only or faulty cable / hub port.
- Authorization prompt never shown because the ADB interface is not enumerated.

**To resume** (after `adb devices` shows the phone as `device`):

```
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
adb shell mkdir -p /sdcard/Android/data/com.snapshelf.app/files/fixtures
adb push tests\fixtures\screenshots\*.png /sdcard/Android/data/com.snapshelf.app/files/fixtures/
adb reverse tcp:8081 tcp:8081
npx expo start --dev-client           # keep running
adb logcat -c
adb shell am start -a android.intent.action.VIEW -d snapshelf:///ocr-spike
npm run ocr:accuracy -- --adb         # after "OCR_SPIKE_DONE" appears in logcat
```

Alternative if the phone cannot be used: x86_64 emulator (needs WHPX/Hyper-V; not checked).
