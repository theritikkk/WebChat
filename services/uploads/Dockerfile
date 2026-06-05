FROM node:20-alpine
WORKDIR /app

# Copy root package files
COPY package.json package-lock.json* ./

# Copy service source
COPY services/uploads/package.json ./services/uploads/
COPY services/uploads/src ./services/uploads/src

# Install only production deps
WORKDIR /app/services/uploads
RUN npm install --omit=dev

ENV NODE_ENV=production
EXPOSE 3004
CMD ["node", "src/index.js"]
