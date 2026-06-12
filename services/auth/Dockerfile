FROM node:20-alpine

WORKDIR /app

COPY package*.json ./

COPY services/auth/package.json ./services/auth/
COPY services/auth/src ./services/auth/src

WORKDIR /app/services/auth

RUN npm install --omit=dev

EXPOSE 3001

CMD ["node", "src/index.js"]
