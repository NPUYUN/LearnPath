@echo off
cd /d "%~dp0"
title LearnPath Launcher

if not exist "%~dp0scripts\start.ps1" (
    echo ERROR: scripts\start.ps1 not found.
    echo Please run this file from the project root folder.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1"
if errorlevel 1 (
    echo.
    echo ----------------------------------------
    echo FAILED - exit code %ERRORLEVEL%
    echo Read the messages above. First-time setup:
    echo   cd backend
    echo   python -m venv .venv
    echo   .venv\Scripts\pip install -r requirements.txt
    echo   cd ..\frontend
    echo   npm install
    echo ----------------------------------------
    pause
    exit /b 1
)

rem 启动成功：自动关闭本 launcher 窗口
exit /b 0
