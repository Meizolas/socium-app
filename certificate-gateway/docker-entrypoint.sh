#!/bin/sh
set -eu
: "${APP_INTERNAL_URL:?APP_INTERNAL_URL is required}"
: "${CERT_GATEWAY_SHARED_SECRET:?CERT_GATEWAY_SHARED_SECRET is required}"
envsubst '${APP_INTERNAL_URL} ${CERT_GATEWAY_SHARED_SECRET}' \
 < /etc/nginx/templates/certificate-auth.conf.template \
 > /etc/nginx/conf.d/certificate-auth.conf
exec nginx -g 'daemon off;'
