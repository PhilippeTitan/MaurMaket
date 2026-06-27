FROM node:20-slim
WORKDIR /app
COPY package*.json strip-mobile-deps.mjs ./
RUN node strip-mobile-deps.mjs && npm install --production
COPY server.js .
RUN mkdir -p uploads
EXPOSE 3001
CMD ["node", "server.js"]
