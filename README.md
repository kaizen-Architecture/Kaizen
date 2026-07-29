# <img width="32px" src="./public/kaizen.png" alt="Kaizen"></img> Kaizen

### 🚀 Created and Maintained by [d4nj3s](https://github.com/danjes)

**Kaizen** is a modern, premium self-hosted **manga downloader** and **manga manager**. Acting as the ultimate **Kaizoku alternative** and successor, this project was born to continue the legacy of the original **Kaizoku** codebase, which was abandoned by its creator. Kaizen introduces a complete visual overhaul, advanced responsiveness, and a smart scheduling system to keep your library always up to date.

![Kaizen Dashboard](./screenshots/dashboard.png)

## ✨ Features

- **🚀 Premium UI/UX**: A stunning "Glassmorphism" interface based on Mantine UI v5, featuring curated themes, responsive design, and fully localized elements.
- **🎨 Modular Theme System & Anti-Flicker Hydration**: Customizable themes (Kaizen vs. Default) with zero-flicker SSR hydration, pre-render blocking background scripts, and automatic system color scheme detection.
- **📖 Integrated Web Reader**: Read your downloaded manga directly in your browser with support for LTR, RTL, and Vertical/Cascade reading directions, image fitting modes (fit to screen, fit to width, original), continuous gapless scroll, and immersive fullscreen view (toggleable via double-click, hotkeys, or dedicated controls). Settings are automatically saved across chapters for a seamless reading experience.
- **👤 Dedicated Per-User Settings**: Global server configuration is restricted to Management (`SUPERADMIN` / `MANAGER`), while all user roles access a personal **User Settings** modal to customize appearance, API tokens, and account security.
- **🔌 Per-User AniList & Multi-Tracker Sync**: Connect personal AniList accounts per user to automatically scrobble read chapters in real-time, import existing reading progress, and export local library progress.
- **✦ Modular Reading List Recommendations**: Cross-references external reading lists (AniList today, extensible to MangaBaka, MyAnimeList, Kitsu) with your local Kaizen library and presents unadded titles with cover art, progress badges, and 1-click **"Add & Download"** actions.
- **📊 Advanced Analytics**: Real-time donut chart visualization of storage distribution by source, along with total library size tracking.
- **🔍 Intelligent Metadata Search**: Automated fallback search logic that leverages alternative titles (synonyms) from AniList and MangaDex to maximize matching success across all providers.
- **⚙️ Configurable Fallback Architecture**: Seamlessly switch or prioritize sequential API providers (**AniList First** vs. **MangaDex First**) dynamically directly from the user Settings menu.
- **✏️ Manual Metadata Control**: Surgical editing capabilities for covers (URLs or local uploads) and custom synopses with automated disk-level persistence.
- **📱 Ultra-Stable Layout Integration**: Verified horizontal and vertical viewport rendering logic to prevent mobile rotation panics.
- **🔗 Universal Reader Interoperability**: Automatic `cover.jpg` extraction for absolute native compatibility with **Kavita**, **Komga**, and other media servers.
- **📁 Extensible REST API**: Premium HTTP REST endpoints supporting advanced filtering (`genre`, `author`, `status`), real-time computed read progress states, secure transaction-level updates (`PATCH` actions) via Bearer tokens, and in-memory direct reading page extraction from `.cbz` files (fully optimized for integrations like **Paperback**). Features an interactive Swagger API playground and query builder at `/api-docs`.
- **🖥️ Real-time Server Log Viewer**: Integrated terminal under **Settings > Maintenance** allowing users to query, search, and live-filter server logs by level or preset tags, with dynamic runtime log-level switching.
- **📅 Smart Background Scheduler**: Optimized asynchronous concurrency checks preventing database saturation or rate-limiting.

## 📸 Interface Previews

| Dashboard | Library | Planner |
| :---: | :---: | :---: |
| ![Dashboard](./screenshots/dashboard.png) | ![Library](./screenshots/library.png) | ![Planner](./screenshots/planner.png) |

## 🔌 API Integration

Kaizen exposes a modular REST API that allows other applications to integrate with it. The API is documented interactively using Swagger.

### Getting Started

1. **Enable the API**: Log in to Kaizen, go to **Settings > Access Control**, and toggle **External REST API** to "On".
2. **Generate a Token**: Go to the **Accounts** (Users) page and generate an API Token for your specific user account.
3. **Authenticate**: Provide this Bearer token in the `Authorization` header of your HTTP requests.

```bash
curl -H "Authorization: Bearer YOUR_USER_API_TOKEN" http://localhost:3000/api/v1/mangas
```

### Documentation

You can view the full interactive OpenAPI (Swagger) documentation, test endpoints, and explore the schema by navigating to `/api-docs` on your Kaizen instance (e.g., `http://localhost:3000/api-docs`).

### 📖 Direct Reading & Page Streaming (Paperback Integration)

Kaizen supports extracting pages on-the-fly directly from downloaded `.cbz` files in local storage without extracting them to disk. 

📱 **Paperback (iOS) Extension:** You can connect your library directly to the Paperback app on iOS using our official source extension:
👉 **[Kaizen Manga Paperback Integration](https://github.com/kaizen-Architecture/Kaizen-Manga-Paperback-Integration)**

* **List Pages (JSON):**
  `GET /api/v1/mangas/{id}/chapters/{chapterId}/pages`
  *Returns an ordered list of all pages in the chapter along with their direct image URLs.*
  
* **Stream Image (Binary):**
  `GET /api/v1/mangas/{id}/chapters/{chapterId}/pages?pageIndex={index}`
  *Streams the raw binary image (JPEG/PNG/WebP/GIF/BMP) with highly optimized cache headers directly to the reader.*

### 🖥️ Integrated Web Reader Controls

The built-in web reader supports advanced configuration for the ultimate reading experience:

* **Reading Direction**: Switch between LTR (Left-to-Right), RTL (Right-to-Left), and Vertical/Cascade (infinite scroll).
* **Fitting Modes**: 
  * *Fit Screen*: Automatically scale pages to fit the height of your viewport.
  * *Fit Width*: Scale pages to match the width of your screen (great for high-res screens and vertical reading).
  * *Original*: Display images in their original resolution.
* **Continuous Scroll (Gapless)**: When reading in Vertical mode, toggle gapless scrolling to join pages seamlessly.
* **Immersive Fullscreen View**: Toggle browser fullscreen mode cleanly (hiding the sidebars and headers) using:
  * The **Pantalla Completa** button in the sidebar or bottom navigation bar.
  * A **Double Click / Double Tap** anywhere on the reading canvas.
  * The **`F` / `f`** hotkey on your keyboard.
* **Settings Persistence**: All your preferences are stored locally in the browser and automatically applied to any chapter or manga you open next.

## 🚧 Features Currently in Staging (Preview)

The following features are active or currently being validated in the **Staging environment** (`docker pull d4nj3s/kaizen-manga-downloader:staging-latest`):

* **🔍 Automated Chapter Integrity Verification**: Background worker audit that detects corrupted `.cbz` archives or HTML 403/404 error pages, purges bad disk files, and schedules automatic clean re-downloads.
* **🔄 Surgical Chapter Deletion & Range Redownload**: Manage individual chapters or select a custom range (e.g., Ch. 132 to 145) from the manga details view to purge disk files and re-trigger clean downloads.
* **🛡️ Instant Post-Download Validation Guard**: Real-time validation after `mangal` downloads that verifies archive structure and image integrity before committing chapters to the database.

## 🔄 Migration & Compatibility

Kaizen is fully backward compatible with existing Kaizoku deployments. 

- **Environment Variables**: Use `KAIZEN_` as a prefix for all variables. If not found, the app automatically falls back to `KAIZOKU_` prefixes.
  - `KAIZEN_PORT` (falls back to `KAIZOKU_PORT`)
  - `KAIZEN_LOG_PATH` (falls back to `KAIZOKU_LOG_PATH`)
- **Database & Data**: All existing data and configurations from Kaizoku are preserved and fully compatible.
- **Persistent Volumes**: Two Docker Compose layouts are provided:
  - **Fresh Installations**: Use the default `docker-compose.yml` for pure brand consistency (uses `./kaizen/` folders).
  - **Upgrading Legacy Kaizoku**: Use `docker-compose.kaizoku-upgrade.yml` to launch with existing `./kaizoku/` host mappings.

## 🚀 Deployment

### Fresh Installation

Deploy clean Kaizen instances using the standard `docker-compose.yml` file:

```yaml
version: '3'

volumes:
  db:
  redis:

services:
  app:
    container_name: kaizen
    image: d4nj3s/kaizen:latest
    environment:
      - DATABASE_URL=postgresql://kaizen:kaizen@db:5432/kaizen
      - KAIZEN_PORT=3000
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - PUID=1000
      - PGID=1000
      - TZ=Europe/Madrid
    volumes:
      - <path_to_library>:/data
      - <path_to_config>:/config
      - <path_to_logs>:/logs
    depends_on:
      db:
        condition: service_healthy
    ports:
      - '3000:3000'
  redis:
    image: redis:7-alpine
    volumes:
      - redis:/data
  db:
    image: postgres:15-alpine
    restart: unless-stopped
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U kaizen']
      interval: 5s
      timeout: 5s
      retries: 5
    environment:
      - POSTGRES_USER=kaizen
      - POSTGRES_DB=kaizen
      - POSTGRES_PASSWORD=kaizen
    volumes:
      - db:/var/lib/postgresql/data
```

### Upgrading Legacy Kaizoku

For existing deployments, launch using the dedicated upgrade layout:

```bash
docker compose -f docker-compose.kaizoku-upgrade.yml up -d
```

## 🛠️ Development

### Requirements

- Node.js 18
- pnpm
- Docker
- [mangal](https://github.com/metafates/mangal)

### Getting Started

```bash
git clone https://github.com/kaizen-Architecture/Kaizen.git
cd Kaizen
cp .env.example .env
pnpm i
docker compose up -d redis db
pnpm prisma migrate deploy
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to see the dashboard.

## 🙏 Credits

Kaizen is a complete evolution of the original [Kaizoku](https://github.com/oae/kaizoku) by [@oae](https://github.com/oae), created and maintained by [d4nj3s](https://github.com/danjes). Following the archiving of the original project, Kaizen maintains and improves the codebase for the community.

Special thanks to [@metafates](https://github.com/metafates) for the [mangal](https://github.com/metafates/mangal) engine.
