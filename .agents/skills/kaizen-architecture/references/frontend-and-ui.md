# Frontend & UI Standards Reference

## 1. Visual Theme: Indigo Glassmorphism

All custom components must follow the Indigo Glassmorphism aesthetic:
- **Framework:** Mantine UI v5.
- **Color Palette:** Deep navy/indigo background (`#0e131f`), translucent cards with thin borders (`rgba(255, 255, 255, 0.08)`), vibrant indigo accents (`#4f46e5` / `#6366f1`).
- **Status Badges:**
  - Teal / Green: Active, Healthy, Completed.
  - Yellow / Orange: Paused, Cooldown, Circuit Breaker Active.
  - Red: Failed, Deactivated, Broken Integrity.
  - Gray / Cyan: Scheduled, Queued, Processing.

---

## 2. SSR Hydration & Tab Safety

Next.js SSR can throw fatal `TypeError: Cannot read properties of undefined` during initial render if state is uninitialized.

### Golden Rules for Components:
1. **Unmounted Tabs (`keepMounted={false}`):**
   Always configure complex tab panels with `keepMounted={false}` so unselected tabs do not attempt to render unhydrated child queries:
   ```tsx
   <Tabs defaultValue="overview" keepMounted={false}>
   ```
2. **Defensive Fallback Objects:**
   Never access nested properties without defensive defaults:
   ```tsx
   const channelMetrics = data?.byChannel || { whatsapp: 0, discord: 0, telegram: 0 };
   ```
3. **Mount Guard for Client-Only APIs:**
   ```tsx
   const [isMounted, setIsMounted] = useState(false);
   useEffect(() => { setIsMounted(true); }, []);
   if (!isMounted) return <LoadingOverlay visible />;
   ```

---

## 3. Responsive Layouts & Mobile Resilience

1. **Table Horizontal Scrolling:**
   All tables (`<Table>`) must be wrapped in a scroll container with explicit whitespace protection:
   ```tsx
   <Box sx={{ overflowX: 'auto', width: '100%' }}>
     <Table sx={{ minWidth: 600, whiteSpace: 'nowrap' }}>
       ...
     </Table>
   </Box>
   ```
2. **Dynamic Viewport Height (`dvh`):**
   Never use static `100vh` on mobile-responsive full-height containers to avoid browser address bar clipping. Use:
   ```css
   min-height: calc(100dvh - 88px);
   ```

---

## 4. Internationalization (i18n) Parity

- **Rule:** Never hardcode user-facing strings in JSX/TSX.
- **Parity Requirement:** When adding a new key or feature, you must add it to **both**:
  - `public/locales/en/<namespace>.json`
  - `public/locales/es/<namespace>.json`
- **Fallback Standard:** When calling `t('key', 'Default English Text')`, the fallback string must always be standard, canonical English.
