@echo off
title SCC EAGLE EYES - Sinkronisasi Excel Unjuk Rasa (Opsi Gratis)
color 0A
echo =====================================================================
echo  SCC - EAGLE EYES: Sync Otomatis Excel Unras ke Cloud / Database
echo  (Solusi 100%% Gratis - Tanpa Power Automate Premium)
echo =====================================================================
echo.
cd /d "%~dp0"

echo [1/2] Menjalankan sinkronisasi data Excel...
call npm run sync:unras

echo.
echo =====================================================================
echo  Sinkronisasi Selesai!
echo =====================================================================
echo.
pause
