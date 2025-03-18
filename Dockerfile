FROM ubuntu:22.04 as builder
SHELL ["/bin/bash", "-c"]

# Install system prerequisites:
#  - curl (to install NVM)
#  - python3 + python-is-python3 (needed by node-gyp)
#  - make + g++ (compiling native modules)
RUN apt-get update && apt-get install -y \
    curl \
    python3 \
    python-is-python3 \
    make \
    g++ \
 && rm -rf /var/lib/apt/lists/*

ENV NVM_DIR=/root/.nvm
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.3/install.sh | bash

ENV NODE_VERSION=20.8.1
ENV PATH="$NVM_DIR/versions/node/v$NODE_VERSION/bin:$PATH"
RUN source $NVM_DIR/nvm.sh \
    && nvm install $NODE_VERSION \
    && nvm alias default $NODE_VERSION \
    && nvm use default \
    && npm install --global yarn node-gyp

WORKDIR /usr/src/app

COPY package.json yarn.lock ./usr/src/app/
RUN yarn install

COPY . /usr/src/app/

FROM node:20.8.1-slim as release
SHELL ["/bin/bash", "-c"]

RUN apt-get update && apt-get install -y netcat-openbsd && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY --from=builder /usr/src/app/node_modules /usr/src/app/node_modules

COPY . /usr/src/app/
