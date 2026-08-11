#!/bin/sh
set -e

# Start the Node API server in the background
node server/index.js &

# Start nginx in the foreground
nginx -g 'daemon off;'
