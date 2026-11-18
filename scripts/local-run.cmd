@echo off
rem Local Android run for Snapshelf (Windows). Double-click or run from the repo:
rem   scripts\local-run.cmd
rem 1) boots the emulator, builds the debug APK (x86_64), installs it, starts Metro and the app;
rem 2) then waits for requests from a fixed menu written to .local-run\request (one line), e.g.
rem      screen | tap X Y | swipe X1 Y1 X2 Y2 | text ASCII | key back|enter|home | launch |
rem      spike | accuracy | fixtures | clear | logcat | db | quit
rem    Nothing else is executed. Output goes to local-run.log; files to .local-run\.
rem Close this window (or request "quit") to stop. Metro runs in its own window.
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0.."
set "ROOT=%CD%"
set "RUN=%ROOT%\.local-run"
set "LOG=%ROOT%\local-run.log"
if not exist "%RUN%" mkdir "%RUN%"
del /q "%RUN%\request" 2>nul

if not defined JAVA_HOME set "JAVA_HOME=C:\Program Files\Microsoft\jdk-17.0.21.21-hotspot"
if not defined ANDROID_HOME set "ANDROID_HOME=D:\Android\Sdk"
if not defined ANDROID_AVD_HOME set "ANDROID_AVD_HOME=D:\Android\avd"
set "PATH=%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\emulator;%JAVA_HOME%\bin;%PATH%"
set "AVD=snap34"
set "APP=com.snapshelf.app"
set "APK=%ROOT%\android\app\build\outputs\apk\debug\app-debug.apk"

echo ==== local-run %DATE% %TIME% > "%LOG%"
echo ROOT=%ROOT% JAVA_HOME=%JAVA_HOME% ANDROID_HOME=%ANDROID_HOME% AVD=%AVD% >> "%LOG%"

call :log "STEP tools"
where adb emulator java node >> "%LOG%" 2>&1 || goto :fail
java -version >> "%LOG%" 2>&1
node -v >> "%LOG%" 2>&1

call :log "STEP emulator"
adb get-state 1>nul 2>nul
if errorlevel 1 (
  call :log "starting emulator %AVD%"
  start "Android emulator" emulator -avd %AVD% -no-boot-anim
)
adb wait-for-device >> "%LOG%" 2>&1
:boot
adb shell getprop sys.boot_completed 2>nul | findstr /b "1" >nul
if errorlevel 1 (
  timeout /t 3 /nobreak >nul
  goto :boot
)
adb shell getprop ro.build.version.release >> "%LOG%" 2>&1
call :log "emulator booted"

call :log "STEP build (gradlew assembleDebug x86_64)"
pushd "%ROOT%\android"
call gradlew.bat assembleDebug -PreactNativeArchitectures=x86_64 --console=plain >> "%LOG%" 2>&1
set "ERR=!ERRORLEVEL!"
popd
if not "!ERR!"=="0" goto :fail
for %%F in ("%APK%") do call :log "APK size %%~zF bytes"

call :log "STEP install"
adb install -r "%APK%" >> "%LOG%" 2>&1 || goto :fail

call :log "STEP metro"
adb reverse tcp:8081 tcp:8081 >> "%LOG%" 2>&1
curl -s http://localhost:8081/status 2>nul | findstr "running" >nul
if errorlevel 1 start "Metro" cmd /k "cd /d "%ROOT%" && npx expo start --dev-client"
set /a WAITED=0
:metro
curl -s http://localhost:8081/status 2>nul | findstr "running" >nul
if errorlevel 1 (
  set /a WAITED+=3
  if !WAITED! gtr 180 goto :fail
  timeout /t 3 /nobreak >nul
  goto :metro
)
call :log "metro running"
call :launch
call :log "READY - waiting for requests in .local-run\request"

:loop
if exist "%RUN%\request" (
  set "REQ="
  set /p REQ=<"%RUN%\request"
  del /q "%RUN%\request"
  call :log "REQUEST !REQ!"
  call :dispatch !REQ!
  call :log "DONE !REQ!"
)
timeout /t 1 /nobreak >nul
goto :loop

:dispatch
if "%~1"=="screen" goto :screen
if "%~1"=="tap" goto :tap
if "%~1"=="swipe" goto :swipe
if "%~1"=="text" goto :text
if "%~1"=="key" goto :key
if "%~1"=="launch" goto :launch
if "%~1"=="spike" goto :spike
if "%~1"=="accuracy" goto :accuracy
if "%~1"=="fixtures" goto :fixtures
if "%~1"=="clear" goto :clear
if "%~1"=="logcat" goto :logcat
if "%~1"=="db" goto :db
if "%~1"=="quit" exit 0
call :log "unknown request %~1 (ignored)"
exit /b 0

:num
rem sets OK=1 when %1 is a non-negative integer
set "OK=0"
echo %~1| findstr /r "^[0-9][0-9]*$" >nul && set "OK=1"
exit /b 0

:screen
adb exec-out screencap -p > "%RUN%\screen.png"
exit /b 0

:tap
call :num %2 & if "!OK!"=="0" exit /b 0
call :num %3 & if "!OK!"=="0" exit /b 0
adb shell input tap %2 %3 >> "%LOG%" 2>&1
exit /b 0

:swipe
for %%N in (%2 %3 %4 %5) do (
  call :num %%N
  if "!OK!"=="0" exit /b 0
)
adb shell input swipe %2 %3 %4 %5 300 >> "%LOG%" 2>&1
exit /b 0

:text
echo %~2| findstr /r "^[A-Za-z0-9][A-Za-z0-9]*$" >nul || exit /b 0
adb shell input text %2 >> "%LOG%" 2>&1
exit /b 0

:key
if "%~2"=="back" adb shell input keyevent 4
if "%~2"=="enter" adb shell input keyevent 66
if "%~2"=="home" adb shell input keyevent 3
exit /b 0

:launch
adb shell am start -a android.intent.action.VIEW -d "exp+snapshelf://expo-development-client/?url=http%%3A%%2F%%2Flocalhost%%3A8081" >> "%LOG%" 2>&1
exit /b 0

:spike
rem OCR fixtures into the app's private files dir, then the dev-only /ocr-spike route.
adb push "%ROOT%\tests\fixtures\screenshots\." /data/local/tmp/fx/ >> "%LOG%" 2>&1
adb shell "run-as %APP% mkdir -p files/fixtures && run-as %APP% sh -c 'cp /data/local/tmp/fx/*.png files/fixtures/'" >> "%LOG%" 2>&1
adb logcat -c
adb shell am start -a android.intent.action.VIEW -d "snapshelf:///ocr-spike" >> "%LOG%" 2>&1
set /a WAITED=0
:spikewait
adb logcat -d | findstr "OCR_SPIKE_DONE" >nul
if errorlevel 1 (
  set /a WAITED+=5
  if !WAITED! gtr 900 (
    call :log "spike: no OCR_SPIKE_DONE after 15 min"
    goto :logcat
  )
  timeout /t 5 /nobreak >nul
  goto :spikewait
)
call :log "spike finished"
goto :logcat

:accuracy
for %%E in (mlkit-latin tesseract routed) do (
  call :log "ocr:accuracy --engine %%E"
  call npm run ocr:accuracy -- --log "%RUN%\logcat.txt" --engine %%E >> "%LOG%" 2>&1
)
exit /b 0

:fixtures
rem The 6 fixture screenshots into the gallery's Screenshots folder, then a media scan.
for %%F in ("%ROOT%\tests\fixtures\screenshots\*.png") do (
  adb push "%%F" /sdcard/Pictures/Screenshots/ >> "%LOG%" 2>&1
  adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file:///sdcard/Pictures/Screenshots/%%~nxF" >nul 2>&1
)
adb shell content call --method scan_volume --uri content://media --arg external_primary >> "%LOG%" 2>&1
exit /b 0

:clear
adb shell pm clear %APP% >> "%LOG%" 2>&1
exit /b 0

:logcat
adb logcat -d > "%RUN%\logcat.txt"
exit /b 0

:db
adb exec-out run-as %APP% cat files/SQLite/snapshelf.db > "%RUN%\snapshelf.db"
exit /b 0

:log
echo [%TIME%] %~1
echo [%TIME%] %~1>> "%LOG%"
exit /b 0

:fail
call :log "FAILED - see local-run.log"
pause
exit /b 1
