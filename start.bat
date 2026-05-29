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

echo Starting LearnPath...
echo.

"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1" -KeepOpen
set "EXITCODE=%ERRORLEVEL%"

echo.
if not "%EXITCODE%"=="0" (
    echo FAILED - exit code %EXITCODE%
) else (
    echo Launcher finished. Services keep running in the background.
    echo   App:  http://localhost:3000/chat
    echo   Logs: storage\logs\
    echo   Stop: stop.bat
)
echo.
echo Press any key to close this window...
pause >nul
exit /b %EXITCODE%
