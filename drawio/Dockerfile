# ---------------------------------------------------------------------------
# draw.io on Debian 13 + Tomcat 9, instead of jgraph/drawio's Ubuntu rock base.
# Only the draw.io app (webapps/draw, a Java war) and its entrypoint/server.xml
# are taken from the upstream image; the OS, JRE and Tomcat are ours, so
# upstream's base-layer baggage (Go `pebble`, certbot's python3 stack) is never
# present. Upgrade = bump TOMCAT_VERSION (+ its sha512) and rebuild.
# ---------------------------------------------------------------------------
ARG TOMCAT_VERSION=9.0.123
ARG DRAWIO_IMAGE=jgraph/drawio:latest

FROM debian:13-slim AS tomcat
ARG TOMCAT_VERSION
RUN apt-get update -qq \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# dlcdn only hosts the newest release; archive.apache.org keeps older ones.
RUN f=apache-tomcat-${TOMCAT_VERSION}.tar.gz; p=tomcat/tomcat-9/v${TOMCAT_VERSION}/bin/$f  && for h in dlcdn.apache.org archive.apache.org/dist; do       curl -fsSL -o t.tgz "https://$h/$p" && curl -fsSL -o t.sha512 "https://$h/$p.sha512" && break;     done  && echo "$(cut -d' ' -f1 t.sha512)  t.tgz" | sha512sum -c -  && mkdir /tomcat && tar -xf t.tgz -C /tomcat --strip-components=1  && rm -rf /tomcat/webapps/* /tomcat/bin/*.bat

FROM ${DRAWIO_IMAGE} AS drawio

FROM debian:13-slim
ENV CATALINA_HOME=/usr/local/tomcat RUN_USER=tomcat RUN_GROUP=tomcat LANG=C.UTF-8
# JRE (provides keytool for the entrypoint), xmlstarlet (entrypoint server.xml edits), curl (healthchecks).
RUN apt-get update -qq \
 && apt-get upgrade -y -qq \
 && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends \
      openjdk-21-jre-headless xmlstarlet curl ca-certificates fontconfig fonts-dejavu-core \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd -r -g 999 ${RUN_GROUP} && useradd -u 1001 -g ${RUN_GROUP} -d ${CATALINA_HOME} -s /bin/bash ${RUN_USER}
COPY --from=tomcat /tomcat ${CATALINA_HOME}
COPY --from=drawio /usr/local/tomcat/webapps/draw ${CATALINA_HOME}/webapps/draw
COPY --from=drawio /usr/local/tomcat/conf/server.xml ${CATALINA_HOME}/conf/server.xml
COPY --from=drawio --chmod=755 /docker-entrypoint.sh /docker-entrypoint.sh
# GID 0 write access is what the entrypoint needs to apply DRAWIO_* settings.
RUN chown -R ${RUN_USER}:0 ${CATALINA_HOME} && chmod -R g=u ${CATALINA_HOME}
ENV PATH=${CATALINA_HOME}/bin:${PATH}
USER tomcat
WORKDIR /usr/local/tomcat
EXPOSE 8080 8443
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["catalina.sh", "run"]
