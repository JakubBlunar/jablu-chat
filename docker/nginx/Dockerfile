FROM nginx:alpine

RUN apk add --no-cache certbot openssl bash

COPY templates /etc/nginx/templates
# NOT in /usr/share/nginx/html — that path is shadowed in production by the
# web-dist volume (web build output), which hides any file copied there.
# error_page → /maintenance.html used to 404 for that reason.
COPY maintenance.html /etc/nginx/html/maintenance.html
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
