# Kaizen Project Memory

## 🌐 Entornos

| Entorno | URL | Notas |
|---------|-----|-------|
| **Staging** | `http://192.168.20.28:3333` | LXC Proxmox, Docker, imagen `staging-latest` |
| **Producción** | — | Imagen Docker `latest` (no tocar) |

> **Proceso de despliegue Staging**: `sudo docker pull d4nj3s/kaizen-manga-downloader:staging-latest && sudo docker compose up -d --force-recreate`
> Las migraciones de Prisma se aplican automáticamente en `40-config` al arrancar (con retry de 10 intentos).

---

## 🧠 Estado Actual - 18/05/2026 (main - Unificado, Consolidado y Estable) ✅

### 0. Unified REST API, Real-time Logs & i18n Unification - DESPLEGADO EN MAIN ✅
- **Estado**: Totalmente consolidado, fusionado mediante fast-forward a `main` (commit `ce59dc7`). Build de staging y producción compilados con éxito en GitHub Actions.
- **Problema resuelto**: Consolidación definitiva de la REST API avanzada, visor de logs en tiempo real, integración secuencial de inyección de metadatos de Kavita libre de database connection pool timeouts, responsive layouts de tablas de Jules (PR #8) y visuales de Swagger de Jules (PR #9).
- **Parches y Mejoras Críticas**:
  - **S6-Overlay Environment Bake**: Solucionado el problema por el cual `/api/v1/info` devolvía `"unknown"` en `gitCommit` debido a que `s6-setuidgid` limpia las variables de entorno de Node en caliente. Ahora el backend utiliza de forma segura `NEXT_PUBLIC_GIT_COMMIT_SHORT` y `NEXT_PUBLIC_BUILD_DATE` como fallback, los cuales se inyectan estáticamente a nivel de compilación tanto en frontend como en backend.
  - **Sidebar Sub-menu Translation Retention**: Corregido el bug por el cual el sub-menú de ajustes perdía su traducción al navegar al Dashboard (`/`), biblioteca (`/library`), planificador (`/scheduler`), fuentes (`/sources`) o ficha de manga (`/manga/[id]`). Se agregó el namespace de traducción `'settings'` en el array de `serverSideTranslations` de todos estos archivos de servidor.
  - **Swagger.json Restoration**: Restaurado el archivo `public/swagger.json` que fue erróneamente eliminado en el PR #9 para evitar errores de fetch 404 al abrir el panel interactivo "Ver Docs" en Ajustes de Desarrollo.
- **Kavita Failed Integrations Tracking & Connection Pool Fix**:
  - `integration.ts`: Concurrencia reducida a **1**. Limiter bajado a `max: 1`.
  - `download.ts`: `integrationQueue.add()` ahora usa `jobId: 'run_integrations'` fijo → BullMQ **deduplica** automáticamente los jobs, evitando que 10 descargas simultáneas lancen 10 escaneos de biblioteca.
  - `kavita.ts`: Se añade **validación de magic bytes PK** del CBZ antes de ejecutar Python. Si el archivo está corrupto, se lanza error inmediato sin gastar un proceso Python.
  - `kavita.ts`: En caso de fallo, se guarda el error en `metadataError` y se marca `metadataFailed = true` en BD.
  - `index.ts (scanLibrary)`: El escaneo automático filtra capítulos con `metadataFailed: true` para no reintentar en bucle infinito.
  - **Migración**: `20260518070000_add_metadata_failure_fields` — añade `metadataFailed BOOLEAN DEFAULT false` y `metadataError TEXT` a la tabla `Chapter`.
  - **UI Dashboard**: `IntegrationHealthCard` muestra anillo bicolor (teal = éxito, rojo = errores) + badge rojo con contador de fallados + botón "Ver Fallados".
  - **UI Modal**: `FailedIntegrationsModal.tsx` — tabla de capítulos fallidos con manga, capítulo, fuente, error exacto y botones Retry/Retry All.
  - **tRPC**: Tres nuevos endpoints: `failedIntegrations` (query), `retryFailedIntegration` (mutation), `retryAllFailedIntegrations` (mutation).
- **Collapsible Settings Sidebar & Full Width Panels**:
  - `navbar.tsx`: Se removió el link estático `/settings`. Se reemplazó por un botón "Settings" tipo acordión colapsable con un indicador de chevron dinámico.
  - Al hacer click en "Settings", si no estás en la sección, te redirige a `/settings?tab=general` y despliega suavemente (con animaciones fluidas usando **Framer Motion**) todas las pestañas de configuración directamente debajo en la barra lateral.
  - `settings.tsx`: Se eliminó el menú de pestañas vertical (`Tabs.List`) que ocupaba un gran espacio horizontal duplicado en pantalla. Ahora el panel de ajustes activo ocupa el **100% del ancho del contenedor**, integrándose armónicamente y optimizando el espacio al máximo.
  - Las pestañas se controlan nativamente mediante el parámetro de consulta query `tab` de `useRouter`, sincronizándose de forma transparente al instante.
- **Visual Git Versioning**:
  - `info.ts`: Nuevo endpoint de API REST público `GET /api/v1/info` que retorna la versión actual, el hash completo del commit Git y la fecha de build.
  - `header.tsx`: Se lee el commit corto (`NEXT_PUBLIC_GIT_COMMIT_SHORT`) y se añade junto a la versión en la cabecera (ej. `v1.10.0 · 3746b85`) con un Mantine Tooltip con la marca de tiempo de compilación.
  - `Dockerfile` & `check.yml`: Inyección automatizada de `GIT_COMMIT` y `BUILD_DATE` durante el build de Next.js y variables del backend.
- **Jules' Mobile Tables & Responsiveness Integration (PR #8 & #9)**:
  - **Estado**: Totalmente integrados, pulidos y fusionados directamente en la rama activa.
  - **Cambios**:
    - Se añade `overflowX: 'auto'` y `minWidth: 600` a las tablas del sistema (como `library.tsx`, `scheduler.tsx`, `users.tsx`, `FailedJobsModal.tsx`, `DownloadQueueModal.tsx`) para asegurar que en pantallas móviles o tabletas no haya cortes visuales y se pueda hacer scroll horizontal limpio.
    - Se reemplazó `height: 'calc(100vh - 88px)'` por `minHeight: 'calc(100dvh - 88px)'` usando *dynamic viewport height* (`dvh`) para erradicar los cortes de la interfaz móvil.
- **CBZ Corruptos identificados en Staging**: `Solo_Max-Level_Newbie [0149][0164]`, `World_s_Strongest_Troll [0119][0120]`, `Surviving_as_a_Barbarian [0056]`, `Magic_Emperor [0677]`. Marcar como `metadataFailed` al desplegar y re-descargar desde fuente alternativa.
- **Limpieza LXC**: Docker build cache (4.79 GB) + imágenes viejas (5.27 GB) eliminados. Disco: 99% → ~75%.

### 1. REST API Expansion & PATCH mutations - COMPLETADO ✅
- **Estado**: Totalmente implementado, integrado y documentado.
- **Funcionalidades**:
    - Añadidos filtros query (`genre`, `author`, `status`) en `GET /api/v1/mangas` para búsquedas avanzadas en el catálogo.
    - Se calcula de forma dinámica y ultrarrápida el bloque `readingStatus` (total, leídos, no leídos, porcentaje de progreso, estado de lectura completa) tanto para la lista de catálogo como para el detalle individual (`GET /api/v1/mangas/[id]`).
    - Implementada mutación de estado de lectura (`PATCH /api/v1/mangas/[id]`) permitiendo actualizaciones masivas de todo el manga (`{ "isRead": boolean }`) o actualizaciones quirúrgicas de capítulos específicos por ID (`{ "chapters": [...] }`) mediante transacciones seguras de base de datos (`prisma.$transaction`).
    - Documentados todos los parámetros de consulta y payload JSON en `api-docs.tsx`.
    - Ampliado el probador interactivo de API nativo `ApiExplorer.tsx` para soportar envío de parámetros query en GET y edición dinámica de payloads JSON para el método PATCH.

### 2. Real-time Server Log Viewer - COMPLETADO ✅
- **Estado**: Totalmente integrado en el panel de Ajustes de la aplicación.
- **Funcionalidades**:
    - Implementado el componente premium `ServerLogViewer.tsx` integrado en la pestaña de **Mantenimiento > Registros del Servidor en Tiempo Real**.
    - Lectura, mapeo (de Pino JSON a niveles trace/debug/info/warn/error) y filtrado de alta velocidad para el archivo `kaizen.log`.
    - Controles interactivos completos de filtrado por nivel de severidad, presets de categorías clave (Integraciones/Kavita, Descarga de Capítulos), búsqueda libre por palabra clave, limitación de líneas de consola, recarga manual, pausa de polling dinámico y botón para copiar logs al portapapeles.
    - **Dynamic Server Log Level Switcher**: Añadido un selector interactivo premium de nivel de log del servidor en tiempo de ejecución ("Server Level: TRACE/DEBUG/INFO/WARN/ERROR") en la barra de controles del visor de logs. Este selector consulta el nivel activo del logger del backend y permite mutarlo en caliente en memoria a través de tRPC. Esto te permite cambiar el nivel de log del servidor al vuelo a "DEBUG" o "TRACE" para analizar una tarea en curso y regresarlo a "INFO" o "WARN" una vez terminado el análisis sin necesidad de reiniciar el contenedor Docker.
    - **Docker Log Path Fallback**: Resuelto el error `ENOENT` por el cual el servidor no encontraba `kaizen.log` en el contenedor al resolver la ruta por defecto a `/app/kaizen.log` en lugar del volumen `/logs/kaizen.log` (debido a que los administradores de servicios de Docker como S6-Overlay limpian las variables de entorno de Node en tiempo de ejecución). Se implementó un ayudante `getLogDir()` compartido que detecta automáticamente si el volumen de logs `/logs` está presente y redirige el log allí de forma transparente e infalible, tanto para escribirlo como para leerlo.

### 3. Failed Queue Alternatives i18n & Mangal Argument Push Stabilization - COMPLETADO ✅
- **Estado**: Completado y verificado en caliente.
- **Cambios Incluidos**:
    - **Localization Fix**: Importado `useTranslation` y agregadas claves multilingües (`failedJobs.alternatives`, etc.) en `common.json` de inglés y español en `FailedJobsModal.tsx` para corregir el bug por el cual el botón de recuperación siempre mostraba el texto `"Alternativas"` en español aunque la interfaz estuviera en inglés.
    - **CLI Stabilization**: Refactorizado el constructor `downloadArgs` en `mangal.ts` para usar agregación limpia con `.push` en lugar de `.splice` de índices frágiles cuando falla la búsqueda exacta y se realiza el fallback difuso, garantizando que la bandera `--manga` obligatoria de la CLI siempre se incluya en el comando final sin importar el tipo de coincidencia.
    - **Manga Picker Fix**: Corregido el valor de la bandera `--manga` cuando se realiza la búsqueda difusa/fallback de descarga. Anteriormente se intentaba pasar el nombre de la serie obtenido (`manga.name`), el cual no es aceptado por la CLI de Mangal (provocando errores de patrón de selección inválido como `X invalid manga picker pattern: From Goblin to Goblin God`). Ahora, en toda búsqueda difusa/fallback de descarga, se fuerza siempre el índice picker `1` para seleccionar el primer resultado y garantizar un flujo libre de errores.
    - **Kavita EACCES Fix**: Solucionado el error de permisos `EACCES: permission denied` al intentar generar el archivo XML temporal `temp_comicinfo_${chapterId}.xml` en la carpeta del servidor `__dirname` (`/app/.next/server/pages/...`), la cual es de solo lectura en los contenedores de producción. Se refactorizó la creación utilizando `os.tmpdir()`, redireccionando el archivo XML temporal a la carpeta del sistema `/tmp`, garantizando permisos de escritura totales y liberando la inyección de metadatos de Kavita.
    - **Prisma Query Log Cleanup**: Restringido el volcado excesivo de logs de base de datos de Prisma (`prisma:query SELECT...`) únicamente para entornos locales de desarrollo (`process.env.NODE_ENV === 'development'`). Esto libera a los logs de producción de miles de líneas innecesarias de consultas SQL, permitiendo que la terminal en tiempo real de **Ajustes > Mantenimiento** sea completamente limpia y solo contenga operaciones reales del sistema.

### Metadata Management System - COMPLETADO ✅
- **Estado**: Implementación completada y lista para compilar en la imagen de Docker `v23-kaizen`.
- **Cambios Incluidos**:
    - **Manual Metadata Override**: Interfaz visual (`EditMetadataModal.tsx`) para editar de forma granular portadas, sinopsis, géneros, autores y estado de publicación desde la vista de detalles del manga.
    - **Local Image Uploads**: Opción intuitiva en el modal con un componente `<FileInput>` para explorar y cargar archivos de imagen nativos directamente desde el dispositivo, convirtiéndolos en cadenas Base64.
    - **Cover Autosaving**: El backend detecta de forma inteligente URLs HTTP y Data URLs (Base64) de portadas personalizadas, guardando la imagen como **`cover.jpg`** en el directorio raíz del manga para satisfacer automáticamente los requerimientos de carátulas personalizadas de **Komga** y **Kavita**.
    - **Live Integration Refresh**: Peticiones asíncronas en caliente a `/api/Series/scan` (Kavita) y `/metadata/refresh` (Komga) para sincronizar metadatos y portadas locales inmediatamente tras su guardado.
    - **Modular Fallback Order**: Pestaña en **Ajustes > Mantenimiento** para alternar de forma nativa entre usar **AniList First** o **MangaDex First** como proveedor de metadatos prioritario.
    - **Sequential Fusion Engine**: Motor de unificación (`metadata-providers.ts`) que combina inteligentemente las respuestas parciales para completar vacíos de información en mangas con indexación compleja.
    - **Database Extensions**: Campo `metadataProviders` integrado en el esquema y migración de Prisma generada.

### Chapter Recovery UI & Next.js Limit Fix - COMPLETADO ✅
- **Estado**: Implementado en el entorno e integrado en el flujo CI/CD automático hacia `staging-latest`.
- **Cambios Incluidos**:
    - **UX Overhaul en Recuperación**: Sustituido el problemático menú plano de los tres puntos por el botón **"Alternativas"** y el modal centralizado **`RecoveryOptionsModal`**, ofreciendo flujos independientes para **Descargar Capítulo** o **Cambiar Fuente**.
    - **Verified Scrapers Grouping**: El backend mapea en caliente las relaciones `MangaSource` ordenadas por prioridad para agrupar el desplegable de recuperación separando **Fuentes Verificadas para este Manga** (`✅`) de otras fuentes sin verificar.
    - **4MB Payload Fix**: Retirada la carga pesada de sinopsis (`summary`) de la consulta principal del catálogo (`manga.query`), reduciendo el JSON un 70-80% y erradicando los errores de límite de API Serverless de Next.js.
    - **CI/CD Automation**: Compilación continua automatizada de capas Docker hacia `staging-latest` y `staging-v1.7.0` con cada push a la rama `main`, bloqueando de forma segura las modificaciones accidentales de la etiqueta de producción `latest`.

### Smart Scheduler Status Categorization - COMPLETADO ✅
- **Objetivo**: Evitar polling innecesario de mangas finalizados o cancelados, estructurando la vista del planificador mediante pestañas de estado de publicación y ofreciendo configuraciones masivas según el ciclo de vida real de la obra.
- **Implementación Realizada**:
    1. **Backend (`manga.ts`)**: Ampliado el procedimiento `getSchedules` para retornar `metadata.status`. Creadas las mutaciones `bulkUpdateIntervalByStatus` y `bulkLockByStatus` para gestionar masivamente intervalos y estados de bloqueo.
    2. **Frontend (`scheduler.tsx`)**:
        - Pestañas dinámicas de Mantine integradas separando vistas en **Ongoing**, **Completed / Finished**, **Hiatus / Cancelled** y **All Series**.
        - Selector compacto de estado (`Select`) incrustado directamente en las filas de las tablas (tanto en vista escritorio como en tarjetas móviles) para forzar correcciones instantáneas de metadatos.
        - Toolbars inteligentes por pestaña ofreciendo atajos de optimización masiva (ej. aplicar intervalo mensual a todos los finalizados o bloquearlos globalmente para aislarlos del motor de auto-escalonamiento).

### v22-kaizen Release - COMPLETADO ✅
- **Estado**: Imagen `d4nj3s/kaizen-manga-downloader:v22-kaizen` construida y subida correctamente.
- **Cambios Incluidos**: 
    - **Source Origin Tracking**: Separación entre fuentes de GitHub y Manuales/Locales.
    - **GitHub Sync**: Implementada sincronización automática con repositorios de scrapers.
    - **Manual Upload**: Posibilidad de subir archivos `.lua` directamente desde la UI.
    - **Smart Auto-Deactivation**: Deactivación automática de fuentes tras 5 fallos consecutivos (PR #22).
    - **Favicon Fix**: Sistema robusto de favicons con fallback al logo de Kaizen.
    - **i18n Support**: Soporte multi-idioma (ES/EN) en la gestión de fuentes y tablas.
    - **Resilience Fix**: Las fuentes ahora se listan como LOCAL por defecto si la base de datos falla, evitando listas vacías por falta de migración.
    - **Database Migration**: Añadida migración formal para la tabla `LuaSource`.

### 0. Mangal Chapter Filtering Fix - COMPLETADO ✅
- **Problema**: `mangal` fallaba al descargar capítulos específicos cuando la lista del scraper cambiaba.
- **Solución**: Añadido el prefijo `@` al argumento `--chapters` en `downloadChapter` para descargar por ID interno exacto.

### 1. Dashboard Upgrade (v1.1) - COMPLETADO ✅
- **Funcionalidad**: Implementado modal de trabajos fallidos (`FailedJobsModal`), reintentos individuales y gráfica de salud de fuentes.
- **Resiliencia**: Implementado `mangalExec` con Exponential Backoff para errores 429.

### 2. Despliegue y Rebranding - COMPLETADO ✅
- **Registry**: `d4nj3s/kaizen-manga-downloader`
- **Variables de Entorno**: Prefijo `KAIZEN_` implementado con fallback a `KAIZOKU_`.

---

## 🛠️ Reglas de Oro para el Agente (Antigravity/Jules)
- **Directorio**: Todo componente nuevo DEBE ir en `src/components/kaizen/`.
- **Estética**: Mantener paleta **Indigo** y **Glassmorphism**.
- **Branding**: Usar siempre el nombre **Kaizen**.
- **Estabilidad**: Priorizar fluidez de la UI sobre animaciones decorativas.
- **Docker (REGLA INAMOVIBLE)**: El tag `latest` NO se toca ni se genera automáticamente. Solo se apunta a `latest` cuando el USUARIO confirme explícitamente la estabilidad.

---

## 📦 Versioning de la App
- `v2.2.27-kaizen` = Docker `staging-latest` / `latest` (REST API Unificada + Real-time Log Viewer + i18n Submenu sidebar fixes + SwaggerUI dark mode + Jules' Responsive tables)
- `v2.2.7-kaizen` = Docker `staging-latest` (UI Recuperación Modal + Scrapers Verificados Agrupados + Next.js 4MB Payload Fix)
- `v2.2.6-kaizen` = Docker `v23-kaizen` (Metadata Override + Modular Fallback Settings)
- `v2.2.5-kaizen` = Docker `v22-kaizen` (PR #22 + GitHub Sync + Manual Upload + Favicon Fix)
- `v2.2.4-kaizen` = Docker `v18-kaizen` (Fix Librería hidratación + Optional Chaining)
- `v2.2.3-kaizen` = Docker `v17-kaizen` (Prisma Engine Fix + Startup Fix)

---

## 🐳 Docker — Registry y Versionado

### Registry
- **DockerHub**: `d4nj3s/kaizen-manga-downloader`

### Estado actual de tags en DockerHub

| Tag | Versión | Estado |
|---|---|---|
| **`latest`** | v2.2.27-kaizen | ✅ **Producción Estable (REST API + Real-time Logs + Swagger + Responsive Submenu Sidebar)** |
| **`staging-latest`** | Current | ✅ Versión de staging activa consolidada con todos los fixes de traducción e inyección secuencial |
| **`v23-kaizen`** | Previous | ✅ Versión de metadatos manual y prioridad modular |
| **`v22-kaizen`** | Previous | ✅ Versión anterior estable |
| `v19-kaizen` | Base | 🧊 Imagen Base Estable (Ubuntu Jammy) |

### 🚀 Flujo de Despliegue en Staging (CI/CD Automático)
Para desplegar la última versión de desarrollo en el entorno de staging:
1. **Compilación Automática**: Realizar un `git push` a cualquier rama que no sea `main`. La canalización de GitHub Actions (`check.yml`) compilará el proyecto y subirá la imagen automáticamente a Docker Hub bajo la etiqueta `d4nj3s/kaizen-manga-downloader:staging-latest`.
2. **Actualización y Reinicio en el Servidor**:
   ```bash
   # 1. Descargar la última imagen de staging
   docker pull d4nj3s/kaizen-manga-downloader:staging-latest

   # 2. Recrear el contenedor con los últimos cambios en caliente
   docker compose up -d --force-recreate
   ```

---

## 📋 Historial de Cambios Recientes (Resumen)
- **18/05/2026 (v2.2.27-kaizen)**: Versión **v2.2.27-kaizen**. Fusión de la rama `feat/rest-api-logs` a la rama de producción `main` consolidando la REST API Avanzada, el **Real-Time Server Log Viewer** con hot-swapping de logs de backend, el motor de inyección secuencial de metadatos de Kavita libre de database connection pool timeouts, y la integración completa de los parches visuales responsivos de Jules (PR #8) y Swagger UI en modo oscuro (PR #9). Se resolvieron errores de traducción del submenú sidebar al navegar fuera de settings cargando el namespace `'settings'` en las props de servidor de todas las páginas principales, y se corrigió el error de Git Commit `"unknown"` en el s6-overlay haciendo fallback estático a variables de compilación `NEXT_PUBLIC_` en la API REST de `/info`.
- **17/05/2026 (v2.2.26-kaizen)**: Versión **v2.2.26-kaizen**. Implementación del API REST Avanzada (búsqueda avanzada por género/autor/estado, bloque de estadísticas de lectura `readingStatus` y mutación transactional `PATCH` para estados de lectura de capítulos y mangas), integración del premium **Real-Time Server Log Viewer** en la pestaña de Mantenimiento, localización multi-idioma (ES/EN) de los botones y modal de alternativas en la cola de fallidas, y refactorización y estabilización robusta de la construcción de argumentos de `mangal.ts` (`downloadArgs` por push) para evitar errores del flag requerido `--manga` en búsquedas difusas.
- **17/05/2026 (v2.2.25-kaizen)**: Versión **v2.2.19-kaizen**. Modularización de la **REST API Externa** y el selector Swagger a una pestaña de primer nivel llamada **Desarrollo / Development** en Ajustes. Limpieza del panel de seguridad de cuentas (`AuthSettings.tsx`) para centrarse exclusivamente en la protección web. Además, se actualizó la canalización CI/CD (`check.yml`) para compilar y subir a Docker Hub la versión de Staging (`staging-latest`) en cada push de ramas de desarrollo, posibilitando pruebas en caliente en el servidor antes del merge a `main`.
- **15/05/2026 (v2.2.24-kaizen)**: Versión **v2.2.18-kaizen**. Creación e integración del scraper nativo en Lua para **TopManhua (`www.topmanhua.fan`)** siguiendo estrictamente el `IA_Scrapper_Prompt` de Mangal. Se implementó una lógica de extracción directa sin necesidad de headless browser, ya que la plataforma expone el listado de capítulos e imágenes de forma nativa en el código HTML de las páginas bajo el estándar Madara. Validado y añadido localmente al repositorio de origen de Kaizen (`Scrappers/TopManhua.lua`).
- **14/05/2026 (v2.2.23-kaizen)**: Versión **v2.2.17-kaizen**. Modernización y refactorización premium de la interfaz de Búsqueda y Adición de Series (**Add Manga Modal**). Solución definitiva al problema de deformación horizontal de la ventana modal causado por la concatenación ilimitada de cadenas de texto al seleccionar múltiples orígenes. Implementación de limitadores inteligentes con conteo resumido en la cabecera del `Stepper` (`steps/index.tsx`). Rediseño maestro del selector de fuentes (`sourceStep.tsx`) sustituyendo los antiguos `Chips` por un Grid de tarjetas interactivas de selección con soporte para filtrado de texto en tiempo real. Reconstrucción del paso de búsqueda (`searchStep.tsx`) eliminando listados redundantes mediante un banner minimalista estilo píldora con desbordamiento acotado y un riel de estado de rastreo vertical con altura máxima, garantizando una presentación hermosa, limpia y completamente responsiva en cualquier dispositivo.
- **14/05/2026 (v2.2.22-kaizen)**: Versión **v2.2.16-kaizen**. Rediseño maestro de la Experiencia de Usuario (UX) del sistema Multi-Usuario y Cuentas. Reubicación del interruptor de activación global (`authEnabled`) como sub-pestaña independiente dentro del panel general de **Ajustes**, inyectando automáticamente la cookie de sesión en el navegador del administrador al habilitarlo para evitar cierres de sesión disruptivos. Filtrado condicional en la barra de navegación superior ocultando la ruta **Cuentas** cuando el sistema opera sin autenticación. Reconstrucción total de la página de Cuentas (`users.tsx`) incorporando detección dinámica de firma de contraseña predeterminada de fábrica con alertas proactivas, módulo agilizado de cambio de contraseña raíz para `admin` y gestión de membresía local en columnas premium.
- **14/05/2026 (v2.2.21-kaizen)**: Versión **v2.2.15-kaizen**. Importación directa y validada de los scrapers de producción **`MangaDex.lua`** y **`MangaKatana.lua`** desde el repositorio secundario de orígenes (`Mangal_Scrappers`) hacia la colección local del descargador de Kaizen (`Scrappers`), expandiendo la matriz de orígenes en local.
- **14/05/2026 (v2.2.20-kaizen)**: Versión **v2.2.14-kaizen**. Limpieza en el árbol de orígenes locales eliminando el directorio de pruebas y volcados temporales de HTML (`Scrappers/Temporal`), preservando exclusivamente los scrapers validados y operativos de producción (`Kingofshojo.lua`, `Mangatown.lua`, `RizzComic.lua`) junto con sus especificaciones en Markdown.
- **14/05/2026 (v2.2.19-kaizen)**: Versión **v2.2.13-kaizen**. Implementación del gestor de **Múltiples Repositorios de Scrapers en la Nube**. Creación del modelo de base de datos `SourceRepository` permitiendo almacenar múltiples orígenes de GitHub con soporte independiente para repositorios **Públicos** (sin autenticación) y **Privados** (mediante Personal Access Tokens individuales). Reescritura del procedimiento de sincronización agregada de servidor iterando sobre todos los orígenes registrados de manera resiliente, manteniendo una retrocompatibilidad absoluta mediante fallback y espejado automático hacia el registro tradicional `Settings` para configuraciones previas. Interfaz de usuario reconstruida en `github.tsx` con listados premium, modales de adición y borrado seguro.
- **14/05/2026 (v2.2.18-kaizen)**: Versión **v2.2.12-kaizen**. Rediseño UX/UI reubicando el botón de Limpieza Global de Capítulos Duplicados hacia el panel de **Mantenimiento** (`StatusAuditSettings.tsx`) con explicaciones detalladas para evitar confusiones. En su lugar, se implementó en el **Planner / Scheduler** el nuevo botón inteligente **"Limpiar Planificación Pestaña"** que desactiva de forma masiva (pone su intervalo en `'never'`) exclusivamente las series visibles bajo la pestaña activa seleccionada que no tengan candados, apoyado por la mutación optimizada de servidor `bulkUpdateInterval`.
- **14/05/2026 (v2.2.17-kaizen)**: Versión **v2.2.11-kaizen**. Desacoplada la gestión de Cuentas y Seguridad de los ajustes de mantenimiento, dotándola de su propia página de primer nivel (**`src/pages/users.tsx`**) con acceso directo en la barra de navegación principal (**Cuentas**) mediante el icono `IconUsers`.
- **14/05/2026 (v2.2.16-kaizen)**: Versión **v2.2.10-kaizen**. Enlazada dinámicamente la gráfica de *Jobs Distribution* (Distribución de Trabajos por Hora) en el **Planner / Scheduler** (`scheduler.tsx`) a la categoría activa seleccionada en las pestañas superiores (*Ongoing*, *Completed*, *Hiatus*) y a los filtros de bloqueo, permitiendo una visualización analítica de carga por tipología en tiempo real sin romper la retención del filtrado de horas.
- **14/05/2026 (v2.2.15-kaizen)**: Versión **v2.2.9-kaizen**. Implementación del Sub-sistema Modular de Autenticación y Control de Acceso Multi-Usuario. Extensión de base de datos introduciendo el modelo `User` con roles (`SUPERADMIN`, `MANAGER`, `READER`), relación Many-to-Many con `Library` (añadiendo nombre y descripción opcional para futuras librerías múltiples) y el flag global `authEnabled`. Middleware a nivel de aplicación (`AuthGuard`) validando sesiones por cookies firmadas (`kaizen-session`), inicialización automática de administrador predeterminado y pantalla inmersiva de Login con *Glassmorphism*.
- **14/05/2026 (v2.2.14-kaizen)**: Versión **v2.2.8-kaizen**. Implementación del Sub-sistema de Auditoría Automática Ligera de Estados de Publicación. Extensión de base de datos con `refreshStatusInterval` y `refreshStatusWindow`, cliente ultra-ligero para AniList/MangaDex GraphQL aislando la descarga exclusiva de estado, worker de BullMQ desacoplado con filtrado en memoria, y panel de ajustes modulares premium localizado.
- **14/05/2026 (v2.2.13-kaizen)**: Versión **2.2.7-kaizen**. Modernización de la interfaz de recuperación de capítulos, agrupación de fuentes verificadas y contracción de payload API Serverless de Next.js.
- **12/05/2026 (v2.2.12-kaizen)**: Versión **2.2.6-kaizen**. Sistema modular de metadatos y override manual en UI.
- **11/05/2026 (v2.2.11-kaizen)**: Versión **2.2.5-kaizen**. Integración de GitHub Sync, Manual Upload y Smart Auto-Deactivation.
- **10/05/2026**: Versión **2.2.4-kaizen**. Fix crítico de la Librería y simplificación de Docker Compose.
- **10/05/2026**: Versión **2.2.3-kaizen**. Fix Prisma Query Engine y hotfix startup.
