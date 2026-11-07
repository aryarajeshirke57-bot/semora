# Semora: one container serves the API, the live updates (SSE) and the built web app on $PORT.
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && mkdir -p .data
ENV NODE_ENV=production PORT=8000
EXPOSE 8000
CMD ["npx", "tsx", "server/index.ts"]
