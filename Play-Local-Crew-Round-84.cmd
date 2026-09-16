@echo off
cd /d "%~dp0"
node tools\start-marauders.mjs --crew --reset --starting-round 84
if errorlevel 1 pause
