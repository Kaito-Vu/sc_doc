# ---------------------------------------------------------------------------
# nginx built from upstream source: statically linked (musl), only the modules
# the gateway uses (proxy, gzip, map, rewrite/return, headers), no TLS (TLS is
# terminated by the upstream proxy), running as non-root on `scratch`. No OS
# packages or libc in the final image, so there is nothing for OS-level CVEs to
# attach to. Upgrade = bump NGINX_VERSION + NGINX_SHA256 (nginx.org/en/download.html).
# ---------------------------------------------------------------------------
ARG NGINX_VERSION=1.30.5
ARG NGINX_SHA256=6c20565aa2325cb82216ae804f4a4ff1875179014759a381c42ddc8e11c4906d

FROM alpine:3 AS build
ARG NGINX_VERSION
ARG NGINX_SHA256
RUN apk add --no-cache build-base linux-headers curl pkgconf pcre2-dev pcre2-static zlib-dev zlib-static
RUN curl -fsSL -o nginx.tgz "https://nginx.org/download/nginx-${NGINX_VERSION}.tar.gz" \
 && echo "${NGINX_SHA256}  nginx.tgz" | sha256sum -c - \
 && mkdir /src && tar -xf nginx.tgz -C /src --strip-components=1
WORKDIR /src
RUN ./configure \
      --prefix=/etc/nginx --sbin-path=/usr/sbin/nginx --conf-path=/etc/nginx/nginx.conf \
      --error-log-path=/dev/stderr --http-log-path=/dev/stdout --pid-path=/tmp/nginx.pid \
      --http-client-body-temp-path=/tmp/client_temp --http-proxy-temp-path=/tmp/proxy_temp \
      --user=nginx --group=nginx \
      --with-http_realip_module \
      --with-cc-opt="-O2 -fstack-protector-strong -D_FORTIFY_SOURCE=2 -fPIE" \
      --with-ld-opt="-static -Wl,-z,relro -Wl,-z,now" \
      --without-http_ssi_module --without-http_userid_module --without-http_autoindex_module \
      --without-http_geo_module --without-http_split_clients_module --without-http_fastcgi_module \
      --without-http_uwsgi_module --without-http_scgi_module --without-http_grpc_module \
      --without-http_empty_gif_module --without-http_browser_module --without-http_referer_module \
      \
      --without-http_charset_module \
      --without-http_auth_basic_module --without-http_mirror_module \
 && make -j"$(nproc)" && make install \
 && strip /usr/sbin/nginx \
 && ! ldd /usr/sbin/nginx 2>/dev/null | grep -q '=>'
# Filesystem skeleton for scratch: non-root user, writable /tmp, mime types.
RUN mkdir -p /root-fs/etc/nginx/conf.d /root-fs/tmp /root-fs/usr/sbin \
 && echo 'nginx:x:101:101:nginx:/nonexistent:/sbin/nologin' > /root-fs/etc/passwd \
 && echo 'nginx:x:101:' > /root-fs/etc/group \
 && cp /etc/nginx/mime.types /root-fs/etc/nginx/ && cp /usr/sbin/nginx /root-fs/usr/sbin/ \
 && chmod 1777 /root-fs/tmp

FROM scratch
COPY --from=build /root-fs/ /
COPY nginx-main.conf /etc/nginx/nginx.conf
USER 101:101
EXPOSE 80
STOPSIGNAL SIGQUIT
ENTRYPOINT ["/usr/sbin/nginx"]
CMD ["-g", "daemon off;"]
