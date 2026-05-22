@echo off
cd /d "%~dp0"
title LearnPath Launcher

echo.
echo ========================================
echo   LearnPath - Start Backend + Frontend
echo ========================================
echo.
echo Project: %CD%
echo.

if not exist "%~dp0scripts\start.ps1" (
    echo ERROR: scripts\start.ps1 not found.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1"
set EXITCODE=%ERRORLEVEL%

echo.
if "%EXITCODE%"=="0" (
    echo OK - http://localhost:3000/chat
) else (
    echo FAILED - exit code %EXITCODE%
)
pause
