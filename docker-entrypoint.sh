#!/bin/sh
set -e
echo "Applying Prisma migrations..."
node_modules/.bin/prisma migrate deploy
exec "$@"
