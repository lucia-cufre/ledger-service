#!/bin/bash
set -e

echo "Waiting for PostgreSQL to be ready..."
until pg_isready -d "$DATABASE_URL" > /dev/null 2>&1; do
  sleep 1
done
echo "PostgreSQL is ready."

# Extract DB name and build a maintenance URL (connect to 'postgres' DB to run CREATE DATABASE)
DB_NAME=$(node -e "const u = new URL('$DATABASE_URL'); console.log(u.pathname.slice(1))")
MAINTENANCE_URL=$(node -e "const u = new URL('$DATABASE_URL'); u.pathname='/postgres'; u.search=''; console.log(u.toString())")

echo "Ensuring database '$DB_NAME' exists..."
psql "$MAINTENANCE_URL" -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 \
  || psql "$MAINTENANCE_URL" -c "CREATE DATABASE \"$DB_NAME\""

echo "Running migrations..."
npm run migrate:latest

exec tini -s -- "$@"
