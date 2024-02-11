FROM node:bullseye

RUN mkdir /app

COPY package.json package-lock.json /app

WORKDIR /app

RUN npm ci

COPY . /app

CMD ["/usr/local/bin/node", "/app/main.js"]

EXPOSE 8800
