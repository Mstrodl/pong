FROM docker.io/node:19-alpine
RUN apk add --no-cache g++ make py3-pip && \
  npm install -g pnpm

WORKDIR /app

COPY package.json pnpm-lock.yaml /app/

RUN pnpm install --production

COPY . /app

CMD ["index.js"]
