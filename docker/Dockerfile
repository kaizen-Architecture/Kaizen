FROM ghcr.io/linuxserver/baseimage-ubuntu:jammy as base

RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
RUN apt-get update && apt-get install -y --no-install-recommends nodejs \
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
  ca-certificates \
  git \
  openssh-client && \
  npm i -g pnpm@6

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

FROM base as runner

# Build-time arguments for version tracking
ARG GIT_COMMIT=unknown
ARG BUILD_DATE=unknown

WORKDIR /tmp

RUN \
  if [ "$(uname -m)" = "x86_64" ] ; then \
  curl -L "https://github.com/metafates/mangal/releases/download/v4.0.6/mangal_4.0.6_Linux_x86_64.tar.gz" -o mangal.tar.gz ;\
  elif [ "$(uname -m)" = "armv6l" ] ; then \
  curl -L "https://github.com/metafates/mangal/releases/download/v4.0.6/mangal_4.0.6_Linux_armv6.tar.gz" -o mangal.tar.gz ;\
  elif [ "$(uname -m)" = "i386" ] ; then \
  curl -L "https://github.com/metafates/mangal/releases/download/v4.0.6/mangal_4.0.6_Linux_i386.tar.gz" -o mangal.tar.gz ;\
  elif [ "$(uname -m)" = "aarch64" ] ; then \
  curl -L "https://github.com/metafates/mangal/releases/download/v4.0.6/mangal_4.0.6_Linux_arm64.tar.gz" -o mangal.tar.gz ;\
  fi
RUN tar xf mangal.tar.gz
RUN mv mangal /usr/bin/mangal
RUN chmod +x /usr/bin/mangal

WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1
ENV HOME="/config"
ENV KAIZEN_LOG_PATH="/logs"
ENV KAIZEN_GIT_COMMIT=$GIT_COMMIT
ENV KAIZEN_BUILD_DATE=$BUILD_DATE

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
