# Backend, Persistence & Self-Healing Reference

## 1. Storage & Volume Strategy

Docker containers are ephemeral by nature. State must be explicitly persisted:

### Named Volumes vs Host Bind Mounts
- **Host Bind Mounts (`./manga:/data`, `./config:/config`):**
  - Used when the user or administrator needs direct access to the files from the host filesystem or NAS shares (`/volume2/...`).
  - Essential for media libraries (manga, videos, music) and human-editable configs.
- **Docker Named Volumes (`redis_data:/data`, `db:/var/lib/postgresql/data`):**
  - Used for background infrastructure services (databases, caches, queues).
  - Managed directly by Docker engine without cluttering user project folders.
  - Ensures data is retained even when running `docker compose up -d --force-recreate`.

### Redis Durability Standard
Always configure Redis with AOF and snapshotting when managing BullMQ job queues:
```yaml
redis:
  image: redis:7-alpine
  command: redis-server --appendonly yes --save 60 1
  volumes:
    - redis_data:/data
```

---

## 2. Startup Self-Healing DDL

Never rely solely on manual migration scripts during cold container boots in production or Kubernetes/Docker environments.

### Implementation Pattern (`settings-cache.ts`)
```typescript
export async function ensureSettingsColumnsExist() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "FailedDownload" (
        "id" SERIAL NOT NULL,
        "mangaId" INTEGER NOT NULL,
        "chapterIndex" TEXT NOT NULL,
        "source" TEXT NOT NULL,
        "attempts" INTEGER NOT NULL DEFAULT 1,
        "isPaused" BOOLEAN NOT NULL DEFAULT false,
        "pausedUntil" TIMESTAMP(3),
        "lastError" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "FailedDownload_pkey" PRIMARY KEY ("id")
      );
    `);
  } catch (err) {
    logger.error(`Self-healing DDL execution failed: ${err}`);
  }
}
```
- Call `ensureSettingsColumnsExist()` inside the startup routine.
- Wrap in try/catch so existing schemas do not crash the service.
- Ensures new columns or tables are created automatically even if the Prisma CLI was skipped.

---

## 3. Pre- and Post-Validation Guards

Never write unverified data to the database or pass unverified files to downstream processors.

### Magic Bytes Check
Before spawning heavy external processes (e.g. Python, unzippers):
- Check magic bytes (e.g. `PK\x03\x04` for ZIP/CBZ archives).
- Abort immediately with an informative error if corrupted or HTML 403/404 payloads are detected.

### Post-Download Integrity Guard
- Run post-download image/archive integrity check immediately after downloading.
- If invalid:
  1. Purge corrupted file from disk (`fs.promises.unlink`).
  2. Throw error before creating database `Chapter` record.
  3. Let Layer 1 Circuit Breaker record the failure.
