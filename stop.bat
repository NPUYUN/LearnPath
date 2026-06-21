@echo off
setlocal EnableExtensions
chcp 65001 >nul 2>&1
cd /d "%~dp0"
title LearnPath Stop

if not exist "%~dp0scripts\stop.ps1" (
    echo ERROR: scripts\stop.ps1 not found.
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
echo   LearnPath - Stop
echo ========================================
echo   Stops backend, frontend, and orphaned
echo   uvicorn reload workers on port 8000.
echo.

"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop.ps1"
set "EXITCODE=%ERRORLEVEL%"

echo.
if not "%EXITCODE%"=="0" (
    echo Stop incomplete - see warning above.
) else (
    echo All services stopped.
)
echo.
pause
exit /b %EXITCODE%
