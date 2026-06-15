@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
cd /d "%~dp0"
title LearnPath Restart

set "PS_EXE="
if exist "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" (
    set "PS_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
) else (
    where pwsh >nul 2>&1
    if not errorlevel 1 set "PS_EXE=pwsh"
)

if not defined PS_EXE (
    echo ERROR: PowerShell not found.
    pause
    exit /b 1
)

echo Restarting LearnPath...
"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop.ps1"
"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1"
set "EXITCODE=%ERRORLEVEL%"

if not "%EXITCODE%"=="0" (
    echo Restart failed.
    pause
    exit /b %EXITCODE%
)
exit /b 0
