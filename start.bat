@echo off
title FetchWave
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is required but was not found.
  echo   Install it from https://nodejs.org and run this again.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo   First run - installing dependencies...
  call npm install --no-audit --no-fund
)

node server/index.js
pause
