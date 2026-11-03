# Git Flow & Release Engineering Reference

## 1. Branching Strategy

- **`main`**: Production branch. Absolutely no direct commits or functional changes allowed on `main`.
- **Feature Branches**: Branch off latest `origin/main`:
  - `feat/<feature-name>` (e.g. `feat/download-circuit-breaker-resilience`)
  - `fix/<bug-name>` (e.g. `fix/integrity-validate-avif`)
  - `chore/<task>` (e.g. `chore/sync-dependencies`)

### Creating a branch
```bash
git fetch origin
git checkout -b feat/my-feature origin/main
```

---

## 2. Conventional Commits

All commit messages must strictly adhere to the Conventional Commits specification:

| Type | Purpose | Example |
|---|---|---|
| `feat:` | New feature or capability | `feat(download): add deterministic circuit breaker and retry resilience` |
| `fix:` | Bug fix or error resolution | `fix(ci): restore ghcr base image, fix ghcr login actor and add build retry` |
| `docs:` | Documentation changes only | `docs: add quick start guide, volume mapping reference and initial library setup` |
| `perf:` | Code change that improves performance | `perf(mangal): add cache and in-flight promise coalescer for search queries` |
| `refactor:` | Code change that neither fixes a bug nor adds a feature | `refactor(ui): extract circuit breaker badge into reusable component` |
| `chore:` | Routine maintenance, build configs, dependencies | `chore(deps): bump actions/setup-node from 3 to 7` |

---

## 3. Two-Tier Deployment Pipeline

### Tier 1: Staging (`staging-latest`)
1. Every `git push` to a non-`main` branch triggers the GitHub Actions workflow (`check.yml`).
2. It compiles TypeScript (`pnpm build`) and builds a multi-architecture Docker image (`linux/amd64` and `linux/arm64`).
3. The image is published to Docker Hub under the tag:
   `d4nj3s/kaizen:staging-latest`
4. The live Staging LXC container (`http://192.168.20.28:3333`) pulls this image:
   ```bash
   docker pull d4nj3s/kaizen:staging-latest && docker compose up -d --force-recreate
   ```
5. Feature behavior and hotfixes are validated live on the Staging environment before merging.

### Tier 2: Production (`latest`)
1. Once validated on Staging, a Pull Request is opened from the feature branch targeting `main`.
2. Ensure all CI status checks (both `build` and `docker`) are green.
3. Merge via Pull Request.
4. The `release-please.yml` workflow automatically computes the next SemVer version, generates changelogs, tags the release, and builds the production Docker tag:
   `d4nj3s/kaizen:latest`
