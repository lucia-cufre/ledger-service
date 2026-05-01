#!/bin/bash
set -e



if [ -z "${CELEBI_HOSTNAME}" ]
then
  echo "Skipping migrations because hostname is not set"
else
  echo "Running migrations on $CELEBI_HOSTNAME"

  # Try Knex migrations first (new system)
  if [ -f "./knexfile.ts" ] || [ -f "./build/knexfile.js" ]; then
    echo "Running Knex migrations..."
    npm run migrate:latest || {
      echo "Knex migrations failed, falling back to legacy SQL migrations..."
      cd ./DB/migrations
      ./migrations.sh || true
      cd ../..
    }
  else
    # Fallback to legacy SQL migrations
    echo "Running legacy SQL migrations..."
    cd ./DB/migrations
    ./migrations.sh || true
    cd ../..
  fi

  # # Sync Prisma schema with database and regenerate client
  # echo "Syncing Prisma schema with database..."
  # npx prisma db pull || {
  #   echo "Warning: prisma db pull failed, continuing with existing schema..."
  # }

  echo "Regenerating Prisma client..."
  npx prisma generate || {
    echo "Warning: prisma generate failed, continuing with existing client..."
  }
fi

# 🔑 Generar UUID para CHARIZARD_TOKEN_SECRET si no existe
if [ -z "$CHARIZARD_TOKEN_SECRET" ] || [ "$CHARIZARD_TOKEN_SECRET" = "" ]; then
    # Verificar si uuidgen está disponible
    if command -v uuidgen >/dev/null 2>&1; then
        export CHARIZARD_TOKEN_SECRET=$(uuidgen)
        echo "🔑 Generated new CHARIZARD_TOKEN_SECRET: $CHARIZARD_TOKEN_SECRET"
    else
        echo "❌ Error: uuidgen not found. Please install uuid-runtime package."
        exit 1
    fi
else
    echo "🔑 Using provided CHARIZARD_TOKEN_SECRET: ${CHARIZARD_TOKEN_SECRET:0:8}..."
fi


# start command from Dockerfile
tini -s -- "$@"