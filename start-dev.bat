@echo off
REM Lance les deux serveurs de developpement dans des fenetres separees
start "assistant:dev" cmd /k npm run assistant:dev
start "dev" cmd /k npm run dev
