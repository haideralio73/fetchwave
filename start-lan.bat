@echo off
title FetchWave (phone access)
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js is required. Get it from https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo   First run - installing dependencies...
  call npm install --no-audit --no-fund
)

echo.
echo   Starting with phone access enabled.
echo   Allow it through the Windows Firewall if prompted (Private networks).
echo.
node server/index.js --lan
pause
