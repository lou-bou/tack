FROM alpine:3.22
RUN apk add --no-cache sqlite rclone supercronic tzdata
COPY backup.sh restore.sh entrypoint.sh test.sh /usr/local/bin/
# rclone writes its cache under HOME; the container runs as the host user (see compose).
ENV HOME=/tmp \
    RCLONE_CONFIG=/config/rclone/rclone.conf
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
