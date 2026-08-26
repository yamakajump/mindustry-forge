@echo off
REM Analyse ce qui est dans le presse-papiers. Copie une schematique dans Mindustry (ctrl+c)
REM puis lance ce fichier.
setlocal
cd /d "%~dp0"
set PYTHONPATH=%~dp0
python tools\analyse.py %*
echo.
pause
