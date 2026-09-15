FROM node:22-alpine

WORKDIR /app/server

COPY server/package*.json ./
RUN npm ci --omit=dev

COPY server/config ./config
COPY server/src ./src
COPY database /app/database

ENV NODE_ENV=production
ENV PORT=8787

EXPOSE 8787

CMD ["node", "src/index.js"]
