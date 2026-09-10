@echo off
cd /d "%~dp0"
node tools\start-marauders.mjs --crew --reset
if errorlevel 1 pause
