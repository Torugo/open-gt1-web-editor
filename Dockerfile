# Serves the Open GT-1 Web Editor (static files only).
# The container never touches USB/MIDI: the browser on the host talks to the GT-1.
# Roland's data is not baked in; users load it from their own files on first run.
FROM nginx:1.27-alpine

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY app/ /usr/share/nginx/html/
# Never ship locally generated Roland data, even if it exists in the build context.
RUN rm -rf /usr/share/nginx/html/data

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
