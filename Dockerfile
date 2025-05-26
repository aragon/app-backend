# ===============================
# 🔨 Builder Stage
# ===============================
FROM node:20.12.2 AS builder

# Create app directory
WORKDIR /usr/src/app

# Only install production dependencies
ENV NODE_ENV=production

# Copy dependency manifests
COPY package.json yarn.lock ./

# Install production dependencies based on lockfile
RUN yarn install --production

# Copy the rest of the application code
COPY . .

# ===============================
# 🚀 Release Stage
# ===============================
FROM node:20.12.2 AS release

# Install runtime tools (e.g., netcat, curl)
RUN apt-get update \
  && apt-get install -y --no-install-recommends netcat-openbsd curl \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app
ENV NODE_ENV=production

# Copy node_modules from the builder stage
COPY --from=builder /usr/src/app/node_modules ./node_modules

# Copy application source
COPY --from=builder /usr/src/app ./

#CMD ["yarn", "start"]
