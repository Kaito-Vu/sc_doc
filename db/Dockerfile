# ---------------------------------------------------------------------------
# PostgreSQL 18 built from upstream source on debian:trixie-slim, with the same
# runtime layout/entrypoint as the official postgres:18 image (PGDATA under
# /var/lib/postgresql, /docker-entrypoint-initdb.d, POSTGRES_* env vars).
# No postgres:18 layer is used; gosu is rebuilt with the latest Go.
# Built with: openssl, icu, lz4, zstd, readline, zlib + contrib (pg_trgm,
# unaccent, ...). No JIT/LLVM, no PL languages.
# Upgrade = bump PG_VERSION + PG_SHA256 (https://ftp.postgresql.org/pub/source/).
# ---------------------------------------------------------------------------
ARG PG_VERSION=18.6
ARG PG_SHA256=555610c24d53e4316da5b7d3fc25c279d96856d5e0e23ee308c328c5fa881d9f

# ---- gosu with latest Go + bumped deps ----
FROM golang:1-alpine AS gosu
RUN apk add --no-cache git \
 && git clone --depth 1 https://github.com/tianon/gosu /src
WORKDIR /src
RUN go get -u golang.org/x/sys github.com/moby/sys/user \
 && go mod tidy \
 && CGO_ENABLED=0 go build -trimpath -ldflags '-s -w' -o /gosu .

# ---- official image entrypoint scripts (not shipped in the postgres tarball) ----
FROM alpine:3 AS entrypoint
RUN apk add --no-cache git \
 && git clone --depth 1 https://github.com/docker-library/postgres /src

# ---- postgres build ----
FROM debian:trixie-slim AS build
ARG PG_VERSION
ARG PG_SHA256
RUN apt-get update -qq \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends \
      build-essential bison flex pkg-config curl ca-certificates bzip2 \
      libssl-dev libicu-dev liblz4-dev libzstd-dev libreadline-dev zlib1g-dev
RUN curl -fsSL -o pg.tar.bz2 "https://ftp.postgresql.org/pub/source/v${PG_VERSION}/postgresql-${PG_VERSION}.tar.bz2" \
 && echo "${PG_SHA256}  pg.tar.bz2" | sha256sum -c - \
 && mkdir /src && tar -xjf pg.tar.bz2 -C /src --strip-components=1
WORKDIR /src
RUN ./configure --prefix=/usr/local/pgsql \
      --with-openssl --with-icu --with-lz4 --with-zstd \
      CFLAGS="-O2 -fstack-protector-strong -D_FORTIFY_SOURCE=2" LDFLAGS="-Wl,-z,relro -Wl,-z,now" \
 && make -j"$(nproc)" world-bin \
 && make install-world-bin DESTDIR=/out \
 && sed -ri "s!^#?(listen_addresses)\s*=\s*\S+.*!\1 = '*'!" /out/usr/local/pgsql/share/postgresql.conf.sample \
 && grep -F "listen_addresses = '*'" /out/usr/local/pgsql/share/postgresql.conf.sample

# ---- final image ----
FROM debian:trixie-slim
ARG PG_VERSION
# Change the value to bust the apt cache layer and pick up new Debian fixes.
ARG APT_SNAPSHOT=""
LABEL org.opencontainers.image.title="PostgreSQL ${PG_VERSION} (source build)" \
      org.opencontainers.image.source="https://www.postgresql.org/"
RUN echo "apt snapshot: $APT_SNAPSHOT" \
 && groupadd -r postgres --gid=999 \
 && useradd -r -g postgres --uid=999 --home-dir=/var/lib/postgresql --shell=/bin/bash postgres \
 && install --verbose --directory --owner postgres --group postgres --mode 1777 /var/lib/postgresql \
 && sed -ri '/\/usr\/share\/locale/d' /etc/dpkg/dpkg.cfg.d/docker \
 && apt-get update -qq \
 && apt-get upgrade -yqq \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends \
      locales libnss-wrapper xz-utils zstd less \
      libssl3t64 libicu76 liblz4-1 libzstd1 libreadline8t64 zlib1g \
 && echo 'en_US.UTF-8 UTF-8' >> /etc/locale.gen && locale-gen \
 && locale -a | grep 'en_US.utf8' \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir /docker-entrypoint-initdb.d \
 && install --verbose --directory --owner postgres --group postgres --mode 3777 /var/run/postgresql
ENV LANG=en_US.utf8 \
    PATH=/usr/local/pgsql/bin:$PATH \
    PGDATA=/var/lib/postgresql/18/docker
COPY --from=build /out/usr/local/pgsql /usr/local/pgsql
COPY --from=gosu /gosu /usr/local/bin/gosu
COPY --from=entrypoint /src/18/trixie/docker-entrypoint.sh /src/18/trixie/docker-ensure-initdb.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-*.sh \
 && ln -sT docker-ensure-initdb.sh /usr/local/bin/docker-enforce-initdb.sh \
 && echo /usr/local/pgsql/lib > /etc/ld.so.conf.d/pgsql.conf && ldconfig \
 && postgres --version && gosu nobody true
VOLUME /var/lib/postgresql
ENTRYPOINT ["docker-entrypoint.sh"]
STOPSIGNAL SIGINT
EXPOSE 5432
CMD ["postgres"]
