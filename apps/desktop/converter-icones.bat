@echo off
echo.
echo ========================================
echo   CONVERSOR DE ICONES - OLIFANT CRM
echo ========================================
echo.

cd /d "%~dp0"

echo Verificando Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo ERRO: Python nao encontrado!
    echo.
    echo Por favor, instale Python 3.x de:
    echo https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

echo Python encontrado!
echo.
echo Executando conversor...
echo.

python convert-icons.py

echo.
pause
