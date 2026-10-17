@echo off
setlocal
cd /d "%~dp0"
if not exist .env (
  copy .env.example .env >nul
  echo Created .env from .env.example.
  echo Add your SerpApi key to the SERPAPI_KEY line, save the file, then run this script again.
  notepad .env
  pause
  exit /b 0
)
echo Running automated tests before startup...
call npm.cmd test
if errorlevel 1 (
  echo Tests failed. PurchaseGuard will not start.
  pause
  exit /b 1
)
echo Starting PurchaseGuard at http://localhost:8080
call npm.cmd start
