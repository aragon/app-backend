FROM node:20.6.0 as builder

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY package.json yarn.lock /usr/src/app/

RUN yarn install

FROM node:20.6.0 as release
RUN apt-get update && apt-get install netcat-openbsd -y

RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app

ENV NODE_ENV=production

COPY --from=builder /usr/src/app/node_modules /usr/src/app/node_modules

COPY . /usr/src/app
