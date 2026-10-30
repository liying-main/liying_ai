@echo off
setlocal

cd /d "%~dp0"

echo.
echo  ========================================
echo   Initializing local tools and assets
echo  ========================================
echo.

node scripts/init-tools.mjs
if errorlevel 1 (
  echo.
  echo  [FAILED] Local initialization failed
  pause
  exit /b 1
)

echo.
echo  [OK] Local tools and assets are ready
pause
