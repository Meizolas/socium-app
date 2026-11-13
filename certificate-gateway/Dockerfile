FROM nginx:1.27-alpine
COPY nginx.conf.template /etc/nginx/templates/certificate-auth.conf.template
COPY docker-entrypoint.sh /certificate-entrypoint.sh
RUN chmod 755 /certificate-entrypoint.sh && rm -f /etc/nginx/conf.d/default.conf
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:8080/health || exit 1
ENTRYPOINT ["/certificate-entrypoint.sh"]
