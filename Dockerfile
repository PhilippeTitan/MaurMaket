FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY server.js .
COPY uploads/ ./uploads/
RUN mkdir -p uploads
EXPOSE 3001
CMD ["node", "server.js"]
