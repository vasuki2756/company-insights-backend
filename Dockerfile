FROM oven/bun:1.0-slim AS builder

WORKDIR /app

COPY package.json bun.lockb ./
RUN bun install --production

COPY src ./src
COPY prisma ./prisma
COPY tsconfig.json .

RUN bun build ./src/index.ts --outdir ./dist --target bun

FROM oven/bun:1.0-slim

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY package.json .

RUN bunx prisma generate

EXPOSE 3001

CMD ["bun", "run", "./dist/index.js"]
