# Dockerfile
FROM node:20-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --omit=dev --legacy-peer-deps

# Copy all source code
COPY . .

# Expose API port
EXPOSE 4000

# Default command (can be overridden in docker-compose)
CMD ["npm", "start"]
