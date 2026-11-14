FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-fund --no-audit
COPY src ./src
COPY openapi.yaml ./
EXPOSE 3000
CMD ["node", "src/server.js"]
