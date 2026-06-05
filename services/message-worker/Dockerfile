FROM node:20-alpine
WORKDIR /app

# Copy root package files (workspace config)
COPY package.json package-lock.json* ./

# Copy service source
COPY services/message-worker/package.json ./services/message-worker/
COPY services/message-worker/src ./services/message-worker/src

# Install only production deps for this service
WORKDIR /app/services/message-worker
RUN npm install --omit=dev

ENV NODE_ENV=production
CMD ["node", "src/index.js"]
