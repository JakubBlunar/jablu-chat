FROM nginx:alpine

RUN apk add --no-cache certbot openssl bash

COPY templates /etc/nginx/templates
COPY maintenance.html /usr/share/nginx/html/maintenance.html
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
