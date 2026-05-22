@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在清理旧进程并启动学径（前端 + 后端）...
powershell -ExecutionPolicy RemoteSigned -File "%~dp0scripts\open.ps1"
