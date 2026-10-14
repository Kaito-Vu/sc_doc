#!/usr/bin/env sh
# Build all images and export them to dist/sc_doc.tar
set -eu
export DOCKER_DEFAULT_PLATFORM=linux/amd64
cd "$(dirname "$0")/.."
OUT="${1:-dist/sc_doc.tar}"
mkdir -p "$(dirname "$OUT")"

docker compose build gateway drawio gotenberg db seaweedfs
docker build -t sc_doc:latest .
docker pull redis:8

docker save -o "$OUT" sc_doc:latest sc_doc-gateway:latest sc_doc-drawio:latest \
  sc_doc-gotenberg:latest sc_doc-db:latest sc_doc-seaweedfs:latest redis:8
echo "Done: $OUT"
