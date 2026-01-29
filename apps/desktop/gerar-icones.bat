@echo off
echo.
echo ========================================
echo   GERADOR DE ICONES - OLIFANT CRM
echo ========================================
echo.

python generate-icons.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ Erro ao gerar icones!
    pause
    exit /b 1
)

python create-icns.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ Erro ao gerar .icns!
    pause
    exit /b 1
)

echo.
echo ========================================
echo   ✅ TODOS OS ICONES FORAM GERADOS!
echo ========================================
echo.
echo 📦 Arquivos criados:
echo   • assets/icon.ico (Windows)
echo   • assets/icon.icns (Mac)
echo   • ../web/public/favicon.ico (Web)
echo.
echo 🎯 Proximos passos:
echo   1. npm run dev (testar)
echo   2. npm run build:win (Windows)
echo   3. npm run build:mac (Mac)
echo.
pause
