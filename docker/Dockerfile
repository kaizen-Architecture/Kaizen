FROM ghcr.io/linuxserver/baseimage-ubuntu:jammy AS base

# Configure APT retries/timeouts and install prerequisites for adding external repositories securely
RUN printf 'Acquire::Retries "5";\nAcquire::http::Timeout "30";\nAcquire::https::Timeout "30";\n' > /etc/apt/apt.conf.d/80-retries && \
    (apt-get update || (sed -i 's|http://archive.ubuntu.com/ubuntu|http://azure.archive.ubuntu.com/ubuntu|g' /etc/apt/sources.list && apt-get update)) && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg && \
    mkdir -p /etc/apt/keyrings && \
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg && \
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_18.x nodistro main" > /etc/apt/sources.list.d/nodesource.list

# Install Node.js, system runtime libraries, and pnpm
RUN (apt-get update || (sed -i 's|http://archive.ubuntu.com/ubuntu|http://azure.archive.ubuntu.com/ubuntu|g' /etc/apt/sources.list && apt-get update)) && \
    apt-get install -y --no-install-recommends \
    nodejs \
    python3 \
    libglib2.0-0 \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxcb1 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    openssl \
    git \
    openssh-client && \
    npm i -g pnpm@8 && \
    rm -rf /var/lib/apt/lists/*

##### DEPENDENCIES

FROM base AS deps

WORKDIR /app

COPY prisma ./
COPY package.json pnpm-lock.yaml ./

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
  pnpm install --no-frozen-lockfile && \
  npx prisma generate

##### BUILDER

FROM base AS builder

# Build-time arguments passed from CI
ARG GIT_COMMIT=unknown
ARG BUILD_DATE=unknown

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED 1
# Bake commit SHA and build date into the Next.js client bundle
ENV NEXT_PUBLIC_GIT_COMMIT_SHORT=${GIT_COMMIT}
ENV NEXT_PUBLIC_BUILD_DATE=${BUILD_DATE}

RUN --mount=type=cache,target=/app/.next/cache pnpm build

##### RUNNER

FROM base AS runner

# Build-time arguments for version tracking
ARG GIT_COMMIT=unknown
ARG BUILD_DATE=unknown

WORKDIR /tmp

RUN \
  ARCH="$(uname -m)" && \
  KAIZEN_MANGAL_VERSION="1.2.0" && \
  case "$ARCH" in \
    x86_64)  KM_ARCH="amd64" ;; \
    aarch64) KM_ARCH="arm64" ;; \
    *) echo "Unsupported architecture: $ARCH" && exit 1 ;; \
  esac && \
  KM_URL="https://github.com/kaizen-Architecture/kaizen-mangal/releases/download/v${KAIZEN_MANGAL_VERSION}/kaizen-mangal_${KAIZEN_MANGAL_VERSION}_linux_${KM_ARCH}.tar.gz" && \
  curl -fsSL --retry 5 --retry-delay 2 --retry-connrefused "$KM_URL" -o kaizen-mangal.tar.gz && \
  tar xf kaizen-mangal.tar.gz kaizen-mangal && \
  mv kaizen-mangal /usr/bin/kaizen-mangal && \
  chmod +x /usr/bin/kaizen-mangal && \
  rm -f kaizen-mangal.tar.gz

WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1
ENV HOME="/config"
ENV KAIZEN_LOG_PATH="/logs"
ENV KAIZEN_GIT_COMMIT=$GIT_COMMIT
ENV KAIZEN_BUILD_DATE=$BUILD_DATE
ENV MANGAL_FORMATS_USE="cbz"
ENV KAIZEN_MANGAL_FORMATS_USE="cbz"
ENV KAIZEN_MANGAL_CONFIG_PATH="/config/kaizen-mangal"
ENV KAIZEN_MANGAL_CACHE_PATH="/config/kaizen-mangal/cache"
ENV KAIZEN_MANGAL_SOURCES_PATH="/config/.config/mangal/sources"
ENV KAIZEN_MANGAL_DISABLE_UPDATE_CHECK="1"

COPY --from=builder /app/next.config.mjs ./
COPY --from=builder /app/next-i18next.config.js ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

COPY docker/mangal /mangal
COPY docker/root/ /

VOLUME [ "/logs", "/config", "/data" ]
