# Kaizen Architecture & Agent Guidelines

## Stack
- Next.js (Pages Router / React), Mantine UI v5, Tailwind CSS
- Backend: tRPC, Prisma ORM, PostgreSQL, Redis (BullMQ)
- Engine: Mangal (Go CLI), Lua Scrapers

## Golden Rules
1. **Never commit directly to `main`**: Always work on dedicated branches (`feat/...` or `fix/...`).
2. **Conventional Commits**: Every commit must follow Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, etc.).
3. **Two-Tier Releases**: Staging (`staging-latest`) builds automatically on feature branch pushes. Merge to `main` via PR to trigger production release (`latest`).
4. **Deterministic First (Layer 1)**: Always solve loop failures, retries, and rate limits deterministically (Circuit Breakers, limits, TTLs) before adding AI diagnostics (Layer 2).
5. **Auto-Healing & Validation**: Ensure database DDL has self-healing fallbacks (`CREATE TABLE IF NOT EXISTS`) and files are verified before database commitment.
6. **i18n Parity**: Any new UI string must have keys in both `public/locales/en/` and `public/locales/es/`.

## Skills
- Use the skill `kaizen-architecture` in `.agents/skills/kaizen-architecture/` for detailed architectural patterns, circuit breakers, and persistence guidelines.
