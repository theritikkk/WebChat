# Build React client + serve with nginx
FROM node:20-alpine AS client-build
WORKDIR /app
COPY apps/client/package.json apps/client/package-lock.json* ./
RUN npm install
COPY apps/client .
ARG VITE_API_BASE=
ARG VITE_CHAT_URL=
ENV VITE_API_BASE=$VITE_API_BASE
ENV VITE_CHAT_URL=$VITE_CHAT_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/aws/nginx/nginx.conf /etc/nginx/nginx.conf
COPY --from=client-build /app/dist /usr/share/nginx/html
RUN mkdir -p /etc/nginx/ssl /var/www/certbot \
    && openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
       -keyout /etc/nginx/ssl/privkey.pem \
       -out /etc/nginx/ssl/fullchain.pem \
       -subj "/CN=localhost"
EXPOSE 80 443
