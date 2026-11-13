FROM postgres:17-alpine
RUN apk add --no-cache age util-linux && mkdir -p /backups && chown 1000:1000 /backups
COPY --chmod=755 ops/backup/*.sh /usr/local/bin/
USER 1000:1000
ENTRYPOINT ["/usr/local/bin/worker.sh"]
