FROM node:22-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci

COPY . .
# Relativo, funciona em qualquer domínio: em produção o front e a API ficam atrás do mesmo
# host, e o Traefik expõe a API em /api (ver stack.production.example.yml). Só existe dentro
# desta imagem — não afeta `.env.production` nem o build usado pelo Playwright (que continua
# absoluto, contra localhost:8000, como o backend-ci e o frontend-e2e já esperam).
ENV VITE_API_BASE_URL=/api
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# `127.0.0.1`, não `localhost`: achado do ensaio local da task 3/19 (validação em jogo) —
# `wget` resolvia `localhost` para `::1` dentro do container e o nginx só escuta em IPv4,
# então o HEALTHCHECK falhava com "connection refused" mesmo com o servidor respondendo
# normalmente (tráfego real do edge-proxy/Traefik nunca passa por essa resolução).
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/ >/dev/null || exit 1

EXPOSE 8080
