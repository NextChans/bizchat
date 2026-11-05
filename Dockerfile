# syntax=docker/dockerfile:1.7
# 비즈챗 브릿지 — Next.js standalone 이미지 (linux/amd64, linux/arm64 공용: Apple Silicon 맥 포함)

# 빌드 단계는 빌드 머신 아키텍처(BUILDPLATFORM)에서 네이티브로 돈다. arm64 를 QEMU 로 빌드하면 수십 분 걸리거나 멈춘다.
# standalone 결과물은 순수 JS(네이티브 모듈 없음, next.config.ts 참고)라 실행 단계만 대상 아키텍처로 만든다.
FROM --platform=$BUILDPLATFORM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ARG APP_VERSION=dev
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    APP_VERSION=${APP_VERSION}
# 비루트 실행. 이미지에는 비밀값을 넣지 않는다(실행 시 환경변수로 주입)
RUN addgroup -S app -g 1001 && adduser -S app -u 1001 -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
# 네이티브 모듈이 섞이면 아키텍처가 어긋나므로 빌드를 실패시킨다
RUN ! find /app -name '*.node' | grep -q .
USER app
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
