@echo off
setlocal
set "BABEL_DATADIR=%~dp0..\..\.venv-science\Lib\site-packages\openbabel\bin\data"
set "OPENBABEL_DATADIR=%BABEL_DATADIR%"
"%~dp0..\..\.venv-science\Scripts\obabel.exe" %*
