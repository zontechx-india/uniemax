@echo off
rem Double-click to start the UnieMax prototype.
rem Starts the tiny server and opens http://localhost:5180 in your browser.
rem Close this window to stop the server.

cd /d "%~dp0"
title UnieMax prototype

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Install it from https://nodejs.org and try again.
  pause
  exit /b 1
)

node server.js --open
pause
