@echo off
cd /d "%~dp0"
node tools\start-marauders.mjs
if errorlevel 1 pause
