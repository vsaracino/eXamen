FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
# Install dependencies but skip Playwright browser installation
RUN npm install --ignore-scripts

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
