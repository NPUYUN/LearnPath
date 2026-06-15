@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
cd /d "%~dp0"
title 学径 LearnPath

if not exist "%~dp0scripts\start.ps1" (
    echo ERROR: scripts\start.ps1 not found.
    echo Please run this file from the project root folder.
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

echo Starting LearnPath...
echo.

"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1"
set "EXITCODE=%ERRORLEVEL%"

if not "%EXITCODE%"=="0" (
    echo.
    echo ----------------------------------------
    echo FAILED - exit code %EXITCODE%
    echo.
    echo Check storage\logs\backend.log.err
    echo Check storage\logs\frontend.log.err
    echo.
    echo First-time setup:
    echo   cd backend
    echo   python -m venv .venv
    echo   .venv\Scripts\pip install -r requirements.txt
    echo   cd ..\frontend
    echo   npm install
    echo ----------------------------------------
    pause
    exit /b %EXITCODE%
)

rem Success: browser opened by start.ps1; close launcher
exit /b 0
