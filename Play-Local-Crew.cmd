@echo off
cd /d "%~dp0"
node tools\start-marauders.mjs --crew
if errorlevel 1 pause
