# Build all images and export them to dist/sc_doc.tar
param([string]$Out = "dist/sc_doc.tar")
$ErrorActionPreference = "Stop"
$env:DOCKER_DEFAULT_PLATFORM = "linux/amd64"
Set-Location (Join-Path $PSScriptRoot "..")
New-Item -ItemType Directory -Force (Split-Path $Out) | Out-Null

function Run { & $args[0] $args[1..($args.Length - 1)]; if ($LASTEXITCODE) { throw "failed: $args" } }

Run docker compose build gateway drawio gotenberg db seaweedfs
Run docker build -t sc_doc:latest .
Run docker pull redis:8

Run docker save -o $Out sc_doc:latest sc_doc-gateway:latest sc_doc-drawio:latest sc_doc-gotenberg:latest sc_doc-db:latest sc_doc-seaweedfs:latest redis:8
Write-Host "Done: $Out"
