# Two-Layer Resilience Architecture Reference

The Two-Layer Architecture separates fault recovery into a **deterministic layer (free, instant)** and an **AI-assisted diagnostic layer (heuristic, cognitive)**.

---

## Layer 1: Deterministic Circuit Breaker (Zero Token Cost)

Always implement Layer 1 first to prevent cascading failure loops, thread pool starvation, and log spam.

### 1. Failure State Persistence
- Dedicated model tracking failed entities (e.g. `FailedDownload`, `FailedIntegration`).
- Fields: `attempts` (counter), `lastError` (text), `isPaused` (boolean), `pausedUntil` (DateTime).
- Compound unique index for instant lookups (e.g. `[mangaId, chapterIndex, source]`).

### 2. Circuit Breaker Rule
- **Threshold:** 3 consecutive failures.
- **Cooling Cooldown:** When threshold is reached, set `isPaused = true` and `pausedUntil = now + 24h`.
- **Queue Discard:** Immediately call `await job.discard()` in BullMQ. This stops BullMQ from re-attempting the job every 2 minutes for 20 attempts.
- **Auto-Recovery on Success:** When a task completes successfully and passes post-validation, delete the failure tracking record to reset the counter to zero.

### 3. Upstream Filtering (Scheduler Defense)
- When recurring schedulers run periodic sweeps (e.g. `checkChapters.ts`), query the paused table first:
  ```typescript
  const pausedRecords = await prisma.failedDownload.findMany({
    where: { isPaused: true, pausedUntil: { gt: new Date() } }
  });
  ```
- Filter out any paused items before adding jobs to BullMQ (`downloadQueue.addBulk(...)`). This prevents the scheduler from re-enqueuing dead chapters every 15 minutes.

### 4. Coherence and Magnitude Guards
- Prevent fuzzy matchers from selecting erroneous records when exact matching fails:
  - Check count sanity: If searching for chapter index `476`, but the fuzzy search result only has `60` chapters, immediately abort with an explicit error instead of picking index 1 or the oldest chapter.
  - Never use arbitrary fallbacks (e.g. oldest chapter) when chapter 0 is missing.

---

## Layer 2: AI-Assisted Diagnostics & Self-Healing

Layer 2 is invoked only on user request or when persistent failures survive Layer 1.

### 1. Injected Domain Context
Provide the LLM with focused, relevant operational data:
- Provider CLI outputs and exact stderr.
- Local filesystem state (existing `.cbz` names vs database title).
- Alternative installed and active sources.
- Canonical metadata (AniList / MangaDex).

### 2. Discrete Action Dispatcher
Never let the AI perform unvalidated code edits. The AI must return a structured action schema:
- `SWITCH_SOURCE`: Switch manga primary source to an alternative that contains the missing chapter.
- `PAUSE_CHAPTER`: Extend or enforce cooldown pause with an explanation.
- `FIX_FOLDER_DISCREPANCY`: Rename misaligned download folder to match media server (Kavita/Komga) expectations.
- `EXPLANATION`: Natural language diagnosis explaining provider Cloudflare protection, dead links, or missing raw scans.
