# TankVitals — imagem do dashboard (build Vite + Nginx servindo os estáticos)
# Construída pelo perfil "app" do infra/docker-compose.yml.

FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Vazio: o front usa caminho relativo (/api, /ws) e quem encaminha para o
# backend é o Nginx da etapa 2.
ENV VITE_API_BASE_URL=""
# Modo simulado (src/config.ts): desligado, o front fala com a API de verdade.
# Para ver as telas sem o backend: --build-arg VITE_MOCK=true.
ARG VITE_MOCK=false
ENV VITE_MOCK=$VITE_MOCK
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.29-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080
