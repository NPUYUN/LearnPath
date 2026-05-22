@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在打开学径本地入口页...
start "" "%~dp0entry.html"
echo.
echo 若服务未启动，请先运行: scripts\dev.ps1
echo 或按 README 分别启动后端与前端。
timeout /t 3 >nul
