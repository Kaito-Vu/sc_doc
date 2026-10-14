# ---------------------------------------------------------------------------
# Gotenberg (Chromium variant, linux/amd64) built from upstream source, with
# the vulnerable parts fixed at build time:
#   - Go binaries (gotenberg, pdfcpu): latest Go toolchain + bumped x/* modules
#   - pdftk-all.jar: commons-lang3 overlaid with a fixed release
#   - Debian packages: apt-get upgrade (incl. chromium)
# Mirrors upstream build/Dockerfile; no upstream image is used as a base, so
# no stale layers are carried over.
# ---------------------------------------------------------------------------
ARG GOTENBERG_VERSION=8.37.0
ARG PDFCPU_VERSION=v0.15.0
ARG PDFTK_VERSION=v3.3.3
ARG COMMONS_LANG3_VERSION=3.18.0
# Bump only the vulnerable modules; everything else stays as pinned upstream.
ARG BUMP="golang.org/x/crypto@latest golang.org/x/image@latest golang.org/x/text@latest golang.org/x/net@latest golang.org/x/sys@latest"
# Change the value to bust the apt cache layers and pick up new Debian fixes.
ARG APT_SNAPSHOT=""

# ----------------------------------------------
# Source + Go build stage
# ----------------------------------------------
FROM golang:1 AS go-build
ARG GOTENBERG_VERSION
ARG PDFCPU_VERSION
ARG BUMP
ENV CGO_ENABLED=0
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends git ca-certificates

RUN git clone --depth 1 --branch v${GOTENBERG_VERSION} https://github.com/gotenberg/gotenberg /gotenberg
WORKDIR /gotenberg
RUN go get ${BUMP} && go mod tidy && go mod verify \
 && go build -o /out/gotenberg -ldflags "-s -w -X 'github.com/gotenberg/gotenberg/v8/cmd.Version=${GOTENBERG_VERSION}'" cmd/gotenberg-chromium/main.go

RUN git clone --depth 1 --branch ${PDFCPU_VERSION} https://github.com/pdfcpu/pdfcpu /pdfcpu
WORKDIR /pdfcpu
RUN go get ${BUMP} && go mod tidy && go mod verify \
 && go build -o /out/pdfcpu -ldflags "-s -w -X 'main.version=${PDFCPU_VERSION}' -X 'github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model.VersionStr=${PDFCPU_VERSION}' -X main.builtBy=gotenberg" ./cmd/pdfcpu \
 && /out/pdfcpu version

# ----------------------------------------------
# Custom JRE stage (PDFtk only)
# ----------------------------------------------
FROM debian:13-slim AS custom-jre-stage
ARG APT_SNAPSHOT
RUN echo "apt snapshot: $APT_SNAPSHOT" \
    && apt-get update -qq \
    && apt-get upgrade -yqq \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends default-jdk-headless binutils
RUN jlink \
    --add-modules java.base,java.desktop,java.naming,java.sql \
    --strip-debug --no-man-pages --no-header-files --compress=2 \
    --output /custom-jre

# ----------------------------------------------
# Downloader stage: pdftk jar with patched commons-lang3
# ----------------------------------------------
FROM debian:13-slim AS downloader-stage
ARG PDFTK_VERSION
ARG COMMONS_LANG3_VERSION
RUN apt-get update -qq \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends curl ca-certificates zip unzip
WORKDIR /downloads
RUN curl -fLs "https://gitlab.com/api/v4/projects/5024297/packages/generic/pdftk-java/${PDFTK_VERSION}/pdftk-all.jar" -o pdftk-all.jar \
 && curl -fsSL -o lang3.jar "https://repo1.maven.org/maven2/org/apache/commons/commons-lang3/${COMMONS_LANG3_VERSION}/commons-lang3-${COMMONS_LANG3_VERSION}.jar" \
 && mkdir lang3 && (cd lang3 && unzip -q ../lang3.jar 'org/*' 'META-INF/maven/*' && zip -qr ../pdftk-all.jar org META-INF) \
 && chmod a+x pdftk-all.jar

# ----------------------------------------------
# Final image
# ----------------------------------------------
FROM debian:13-slim
ARG GOTENBERG_VERSION
ARG APT_SNAPSHOT
ENV TZ=UTC
COPY --from=custom-jre-stage /custom-jre /opt/java
ENV PATH="/opt/java/bin:${PATH}"

LABEL org.opencontainers.image.title="Gotenberg (Chromium, patched)" \
    org.opencontainers.image.version="$GOTENBERG_VERSION" \
    org.opencontainers.image.source="https://github.com/gotenberg/gotenberg"

# Non-root user; arbitrary UID support (OpenShift) as upstream.
RUN echo "apt snapshot: $APT_SNAPSHOT" \
    && groupadd --gid 1001 gotenberg \
    && useradd --uid 1001 --gid gotenberg --shell /bin/bash --home /home/gotenberg --no-create-home gotenberg \
    && mkdir /home/gotenberg \
    && chown gotenberg: /home/gotenberg

RUN apt-get update -qq \
    && apt-get upgrade -yqq \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends \
        ca-certificates tini curl \
        fonts-crosextra-carlito fonts-crosextra-caladea fonts-liberation fonts-liberation2 \
        fonts-dejavu fonts-noto-cjk fonts-noto-color-emoji fonts-noto-core \
        qpdf exiftool chromium \
    && mkdir -p /usr/share/man/man1 \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

RUN printf '#!/bin/bash\n\nexec java -jar /usr/bin/pdftk-all.jar "$@"' > /usr/bin/pdftk \
    && chmod +x /usr/bin/pdftk \
    && usermod -aG root gotenberg \
    && chgrp -R 0 /home/gotenberg \
    && chmod -R g=u /home/gotenberg

COPY --from=go-build /gotenberg/build/fonts.conf /etc/fonts/conf.d/100-gotenberg.conf
COPY --from=go-build /gotenberg/build/capture-version.sh /opt/gotenberg/capture-version.sh
COPY --from=go-build --chown=1001:1001 /gotenberg/build/chromium-hyphen-data /opt/gotenberg/chromium-hyphen-data
COPY --from=downloader-stage /downloads/pdftk-all.jar /usr/bin/pdftk-all.jar
COPY --from=go-build /out/pdfcpu /usr/bin/pdfcpu
COPY --from=go-build /out/gotenberg /usr/bin/gotenberg

ENV LANG=C.UTF-8 LC_ALL=C.UTF-8 \
    PDFTK_BIN_PATH=/usr/bin/pdftk QPDF_BIN_PATH=/usr/bin/qpdf \
    EXIFTOOL_BIN_PATH=/usr/bin/exiftool PDFCPU_BIN_PATH=/usr/bin/pdfcpu \
    GOTENBERG_VERSIONS_DIR_PATH=/opt/gotenberg/versions \
    OTEL_TRACES_EXPORTER=none OTEL_METRICS_EXPORTER=none OTEL_LOGS_EXPORTER=none \
    CHROMIUM_BIN_PATH=/usr/bin/chromium \
    CHROMIUM_HYPHEN_DATA_DIR_PATH=/opt/gotenberg/chromium-hyphen-data \
    PDFENGINES_CONVERT_ENGINES=

RUN bash /opt/gotenberg/capture-version.sh "$GOTENBERG_VERSIONS_DIR_PATH" qpdf "$QPDF_BIN_PATH" --version \
    && bash /opt/gotenberg/capture-version.sh "$GOTENBERG_VERSIONS_DIR_PATH" exiftool "$EXIFTOOL_BIN_PATH" -ver \
    && bash /opt/gotenberg/capture-version.sh "$GOTENBERG_VERSIONS_DIR_PATH" pdftk "$PDFTK_BIN_PATH" --version \
    && bash /opt/gotenberg/capture-version.sh "$GOTENBERG_VERSIONS_DIR_PATH" pdfcpu "$PDFCPU_BIN_PATH" version \
    && bash /opt/gotenberg/capture-version.sh "$GOTENBERG_VERSIONS_DIR_PATH" chromium "$CHROMIUM_BIN_PATH" --version

USER gotenberg
WORKDIR /home/gotenberg
EXPOSE 3000
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["gotenberg"]
