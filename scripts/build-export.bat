@echo off
setlocal
set "DOCKER_DEFAULT_PLATFORM=linux/amd64"
cd /d "%~dp0.."
set "OUT=%~1"
if "%OUT%"=="" set "OUT=dist\sc_doc.tar"
if not exist dist mkdir dist

docker compose build gateway drawio gotenberg db seaweedfs || goto :err
docker build -t sc_doc:latest . || goto :err
docker pull redis:8 || goto :err

docker save -o "%OUT%" sc_doc:latest sc_doc-gateway:latest sc_doc-drawio:latest sc_doc-gotenberg:latest sc_doc-db:latest sc_doc-seaweedfs:latest redis:8 || goto :err
echo Done: %OUT%
exit /b 0
:err
echo FAILED with errorlevel %errorlevel%
exit /b 1
