# Dùng bản Node nhẹ nhất
FROM node:18-alpine

# Tạo thư mục làm việc trong container
WORKDIR /app

# Copy file package để cài thư viện trước (tối ưu cache)
COPY package*.json ./
RUN npm install

# Copy toàn bộ code vào
COPY . .

# Mở port 3000
EXPOSE 3000

# Lệnh chạy bot
CMD ["node", "bot.js"]