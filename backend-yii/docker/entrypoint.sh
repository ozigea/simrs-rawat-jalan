#!/bin/sh
set -e
cd /var/www/html

# Schema is owned by Yii migrations (K-5). Demo data is idempotent; set SEED_ON_START=false to skip.
php yii migrate/up --interactive=0
if [ "${SEED_ON_START:-true}" = "true" ]; then
  php yii seed
fi

# Marker used by the compose healthcheck.
touch /tmp/ready
exec "$@"
