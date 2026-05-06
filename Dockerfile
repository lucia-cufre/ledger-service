FROM node:22-alpine

RUN apk add --no-cache tini postgresql-client

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY knexfile.js ./
COPY knex ./knex
COPY src ./src
COPY docker-entrypoint.sh ./

RUN npm run build && chmod +x docker-entrypoint.sh

EXPOSE 4000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
