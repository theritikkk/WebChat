FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

COPY services/chat/package.json ./services/chat/
COPY services/chat/src ./services/chat/src

WORKDIR /app/services/chat

RUN npm install --omit=dev

EXPOSE 5000

CMD ["node", "src/index.js"]
