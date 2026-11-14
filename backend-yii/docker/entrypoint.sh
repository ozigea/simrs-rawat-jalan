#!/bin/sh
set -e
# Marker used by the compose healthcheck.
touch /tmp/ready
exec "$@"
