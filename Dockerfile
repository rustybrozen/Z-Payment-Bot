
FROM node:18-alpine


WORKDIR /app


COPY package*.json ./
RUN npm install


COPY . .


EXPOSE 8495

CMD ["node", "bot.js"]