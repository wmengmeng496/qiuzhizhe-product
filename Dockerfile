FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/out /usr/share/nginx/html
COPY deploy/nginx-qiuzhijianli.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
