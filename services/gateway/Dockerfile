FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

COPY services/gateway/package.json ./services/gateway/
COPY services/gateway/src ./services/gateway/src

WORKDIR /app/services/gateway

RUN npm install --omit=dev

EXPOSE 4000

CMD ["node", "src/index.js"]
