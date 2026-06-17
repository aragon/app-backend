# ===============================
# 🔨 Builder Stage
# ===============================
FROM node:24.14.0 AS builder

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# Create app directory
WORKDIR /usr/src/app

# Copy dependency manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Cache the pnpm version pinned via the packageManager field
RUN corepack install

# Install ALL dependencies (ignore NODE_ENV for installation)
RUN NODE_ENV=development pnpm install --frozen-lockfile

# Copy the rest of the application code
COPY . .

# ===============================
# 🚀 Release Stage
# ===============================
FROM node:24.14.0 AS release

# Install runtime tools (e.g., netcat, curl)
RUN apt-get update \
  && apt-get install -y --no-install-recommends netcat-openbsd curl \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /usr/src/app

# Set production environment for runtime
ENV NODE_ENV=production

# Copy node_modules from the builder stage (includes ALL dependencies)
COPY --from=builder /usr/src/app/node_modules ./node_modules

# Copy application source
COPY --from=builder /usr/src/app ./

# Cache the pinned pnpm inside the image so pnpm commands work offline at runtime
RUN corepack install

# CMD ["pnpm", "start"]
