FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY public ./public

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD wget -qO- http://127.0.0.1:3000/saude || exit 1

CMD ["node", "src/server.js"]
