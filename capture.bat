@echo off
REM Fire-and-forget Canvas session capture for StudyStation.
REM Double-click this from the repo folder - it opens a real browser,
REM you log into VCCS/Canvas once, and it auto-uploads + syncs.
REM
REM Requires:
REM   - .env with CANVAS_BASE_URL and STUDYSTATION_BASE_URL (already set up)
REM   - playwright + chromium installed (one-time: pip install -r requirements-dev.txt
REM     then: python -m playwright install chromium)

setlocal
cd /d "%~dp0"

echo.
echo === StudyStation Session Capture ===
echo A browser will open. Log into VCCS/Canvas and let your dashboard fully load.
echo It will auto-save, auto-upload, and trigger a sync. Then it closes.
echo.
echo If .venv exists, use it:
if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" capture_session.py
    goto done
)

python capture_session.py

:done
echo.
echo === Done ===
echo Press any key to close this window.
pause > nul
endlocal
