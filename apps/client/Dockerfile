FROM node:20-alpine AS builder

WORKDIR /app

COPY apps/client/package*.json ./

RUN npm install

COPY apps/client .

RUN npm run build

FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
