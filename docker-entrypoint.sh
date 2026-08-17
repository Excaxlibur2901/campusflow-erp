#!/bin/sh
set -e

# If Render or hosting environment specifies a PORT, update nginx listen port
if [ -n "$PORT" ] && [ "$PORT" != "80" ]; then
  sed -i "s/listen 80;/listen $PORT;/g" /etc/nginx/http.d/default.conf
fi

# Start the Node API server in the background
node server/index.js &

# Start nginx in the foreground
nginx -g 'daemon off;'
