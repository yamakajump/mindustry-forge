@echo off
REM Ouvre l'analyseur dans le navigateur. Colle une schematique ou depose un .msch.
setlocal
cd /d "%~dp0"
set PYTHONPATH=%~dp0
python tools\serve.py
pause
