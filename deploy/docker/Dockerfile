# Single image, multiple Deployments — set WEBCHAT_SERVICE to auth | gateway | messages | chat
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/client/package.json apps/client/
COPY services/auth/package.json services/auth/
COPY services/gateway/package.json services/gateway/
COPY services/messages/package.json services/messages/
COPY services/chat/package.json services/chat/
COPY services ./services
COPY apps ./apps
RUN npm ci --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY services ./services
COPY apps ./apps
ENV NODE_ENV=production
EXPOSE 3001 3003 4000 5000
CMD ["sh", "-c", "exec node services/${WEBCHAT_SERVICE}/src/index.js"]
