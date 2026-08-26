@echo off
REM Ouvre l'analyseur. Tout le calcul se fait dans le navigateur : ce serveur ne fait que
REM servir des fichiers, et le site publie n'en aura meme pas besoin.
setlocal
cd /d "%~dp0site\public"
start "" http://127.0.0.1:8770/
python -m http.server 8770
