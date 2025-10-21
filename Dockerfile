# ===============================
# 🔨 Builder Stage
# ===============================
FROM node:22.18.0 AS builder

# Create app directory
WORKDIR /usr/src/app

# Copy dependency manifests
COPY package.json yarn.lock ./

# Install ALL dependencies (ignore NODE_ENV for installation)
RUN NODE_ENV=development yarn install --frozen-lockfile

# Copy the rest of the application code
COPY . .

# ===============================
# 🚀 Release Stage
# ===============================
FROM node:22.18.0 AS release

# Install runtime tools (e.g., netcat, curl)
RUN apt-get update \
  && apt-get install -y --no-install-recommends netcat-openbsd curl \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Set production environment for runtime
ENV NODE_ENV=production

# Copy node_modules from the builder stage (includes ALL dependencies)
COPY --from=builder /usr/src/app/node_modules ./node_modules

# Copy application source
COPY --from=builder /usr/src/app ./

# CMD ["yarn", "start"]
