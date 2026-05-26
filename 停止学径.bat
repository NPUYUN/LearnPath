@echo off
cd /d "%~dp0"
title Stop LearnPath

if not exist "%~dp0scripts\stop.ps1" (
    echo ERROR: scripts\stop.ps1 not found.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop.ps1"
timeout /t 2 >nul
exit /b 0
