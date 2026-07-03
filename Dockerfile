FROM node:20-alpine
WORKDIR /app
COPY backend-node/package*.json ./backend-node/
RUN cd backend-node && npm install --omit=dev
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
