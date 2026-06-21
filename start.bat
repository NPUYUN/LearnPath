@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
cd /d "%~dp0"
title LearnPath Launcher

if not exist "%~dp0scripts\start.ps1" (
    echo ERROR: scripts\start.ps1 not found.
    pause
    exit /b 1
)

set "PS_EXE="
if exist "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" (
    set "PS_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
) else if exist "%SystemRoot%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe" (
    set "PS_EXE=%SystemRoot%\SysWOW64\WindowsPowerShell\v1.0\powershell.exe"
) else (
    where pwsh >nul 2>&1
    if not errorlevel 1 set "PS_EXE=pwsh"
)

if not defined PS_EXE (
    echo ERROR: PowerShell not found.
    pause
    exit /b 1
)

echo.
echo ========================================
echo   LearnPath - Start
echo ========================================
echo.

echo [1/2] Cleaning old processes ^(including orphan uvicorn workers^)...
"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop.ps1"
if not "%ERRORLEVEL%"=="0" (
    echo.
    echo WARNING: Cleanup reported busy ports. Continuing start anyway...
    echo          If API behaves oddly, run stop.bat again first.
    echo.
    timeout /t 2 >nul
)

echo [2/2] Starting backend and frontend...
echo.

"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1" -NoBrowser -KeepOpen
set "EXITCODE=%ERRORLEVEL%"

echo.
if not "%EXITCODE%"=="0" (
    echo FAILED - exit code %EXITCODE%
    echo Check storage\logs\backend.log.err and frontend.log.err
) else (
    echo Services are running in the background.
    echo   App:    http://127.0.0.1:3000/chat
    echo   API:    http://127.0.0.1:8000/api/health
    echo   Stop:   stop.bat
    echo.
    echo Tip: health should show features.review_cards = true
)
echo.
echo Press any key to close this window...
pause >nul
exit /b %EXITCODE%
