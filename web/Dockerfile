FROM node:20-alpine
RUN apk add --no-cache docker-cli
WORKDIR /app/web
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
