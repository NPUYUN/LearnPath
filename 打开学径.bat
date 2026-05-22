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
    echo Please run this file from the project root folder.
    pause
    exit /b 1
)

echo Starting services, please wait...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1"
set EXITCODE=%ERRORLEVEL%

echo.
echo ----------------------------------------
if "%EXITCODE%"=="0" (
    echo OK - Services started in separate windows.
    echo Open: http://localhost:3000/chat
    echo If the page fails, check "LearnPath Backend" and "LearnPath Frontend" windows.
) else (
    echo FAILED - exit code %EXITCODE%
    echo Read the messages above. First-time setup:
    echo   cd backend
    echo   python -m venv .venv
    echo   .venv\Scripts\pip install -r requirements.txt
    echo   cd ..\frontend
    echo   npm install
)
echo ----------------------------------------
echo.
pause
