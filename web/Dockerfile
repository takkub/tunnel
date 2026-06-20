FROM node:20-alpine
RUN apk add --no-cache docker-cli curl && \
    curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64" \
      -o /usr/local/bin/cloudflared && \
    chmod +x /usr/local/bin/cloudflared
WORKDIR /app/web
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
