# Stage 1: Build Angular
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install --prefer-offline

COPY . .
RUN npm run build -- --configuration=production

# Stage 2: Serve con Nginx (imagen final liviana)
FROM nginx:alpine

# Copiar el build al directorio de Nginx
COPY --from=builder /app/dist/seismic-frontend/browser /usr/share/nginx/html

# Configuración de Nginx para Angular (SPA routing)
RUN echo 'server { \
  listen 80; \
  location / { \
    root /usr/share/nginx/html; \
    index index.html; \
    try_files $uri $uri/ /index.html; \
  } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
