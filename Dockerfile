
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY src/ ./src/
COPY public/ ./public/
COPY tsconfig.json ./

RUN npm run build
EXPOSE 3001 6001

CMD ["npm", "start"]
