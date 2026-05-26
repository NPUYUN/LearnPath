@echo off
cd /d "%~dp0"
title LearnPath Launcher

if not exist "%~dp0scripts\start.ps1" (
    echo ERROR: scripts\start.ps1 not found.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start.ps1"
if errorlevel 1 (
    echo.
    echo FAILED - exit code %ERRORLEVEL%
    pause
    exit /b 1
)

rem 启动成功：自动关闭本 launcher 窗口（服务在后台运行，无控制台窗口）
exit /b 0
