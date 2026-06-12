FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

COPY services/messages/package.json ./services/messages/
COPY services/messages/src ./services/messages/src

WORKDIR /app/services/messages

RUN npm install --omit=dev

EXPOSE 3003

CMD ["node", "src/index.js"]
