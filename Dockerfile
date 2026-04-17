FROM node:24-alpine

WORKDIR /app

COPY package.json ./
COPY server.js ./
COPY public ./public
COPY data/.gitkeep ./data/.gitkeep
COPY uploads/.gitkeep ./uploads/.gitkeep

EXPOSE 3000

CMD ["node", "server.js"]
