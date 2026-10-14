# ---------------------------------------------------------------------------
# SeaweedFS built from upstream source on a plain Alpine base, replicating the
# `final` stage of upstream docker/Dockerfile.go_build. No chrislusf/seaweedfs
# layer is carried over (its /usr/bin/weed layer holds the old Go stdlib, which
# layer-aware scanners flag even when overwritten). Omitted vs upstream: the
# prebuilt Rust weed-volume / weed-worker (only for the optional `volume-rust` /
# `worker-rust` modes); this stack runs `weed server`.
# ---------------------------------------------------------------------------
FROM golang:1-alpine AS build
ARG SEAWEEDFS_VERSION=4.48
ENV CGO_ENABLED=0
RUN apk add --no-cache git
RUN git clone --depth 1 --branch ${SEAWEEDFS_VERSION} https://github.com/seaweedfs/seaweedfs /src
WORKDIR /src/weed
# Rebuild `weed` with the latest Go toolchain and bumped x/* modules.
RUN go get golang.org/x/crypto@latest golang.org/x/image@latest golang.org/x/text@latest golang.org/x/net@latest golang.org/x/sys@latest \
 && go mod tidy \
 && go build -ldflags "-s -w -extldflags -static" -o /weed .

FROM alpine:3
LABEL author="Chris Lu" org.opencontainers.image.source="https://github.com/seaweedfs/seaweedfs"
COPY --from=build /weed /usr/bin/weed
COPY --from=build /src/docker/filer.toml /etc/seaweedfs/filer.toml
COPY --from=build /src/docker/entrypoint.sh /entrypoint.sh
# FIPS 140-3 mode is ON by default (Go 1.24+); disable with GODEBUG=fips140=off.
RUN apk upgrade --no-cache \
 && apk add --no-cache fuse curl su-exec \
 && addgroup -g 1000 seaweed && adduser -D -u 1000 -G seaweed seaweed \
 && mkdir -p /data/filerldb2 \
 && chown -R seaweed:seaweed /data /etc/seaweedfs \
 && chmod 755 /entrypoint.sh
EXPOSE 18080 8080 18888 8888 19333 9333 8333 7333
VOLUME /data
WORKDIR /data
# Entrypoint fixes /data ownership and drops to the seaweed user.
ENTRYPOINT ["/entrypoint.sh"]
CMD ["mini", "-dir=/data"]
