@echo off
setlocal
cd /d "%~dp0"

where uv >nul 2>&1 || (
  echo uv is not installed. Get it from https://docs.astral.sh/uv/  ^(winget install astral-sh.uv^)
  pause & exit /b 1
)

if not exist "frontend\dist\index.html" (
  where npm >nul 2>&1 || (
    echo Node.js is not installed. Get it from https://nodejs.org/  ^(winget install OpenJS.NodeJS.LTS^)
    pause & exit /b 1
  )
  echo Building the interface ^(first run only^)...
  pushd frontend
  call npm install || (popd & pause & exit /b 1)
  call npm run build || (popd & pause & exit /b 1)
  popd
)

uv run mp3-x %*
if errorlevel 1 pause
