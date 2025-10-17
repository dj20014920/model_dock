# Repository Guidelines

## Project Structure & Module Organization
- `src/app` — React UI (components, pages, hooks, state, i18n).
- `src/background` — background/service worker logic.
- `src/content-script` — in‑page/content scripts and proxies.
- `src/services` — API clients, storage, agents (`agent/`), and integrations.
- `src/utils` — shared helpers; `src/types` — TypeScript types.
- `_locales/` — Chrome i18n message bundles; `public/` — static assets.
- Build/config: `manifest.config.ts`, `vite.config.ts`, `tailwind.config.cjs`.
- Note: `.next/` is build output; do not edit.

## Build, Test, and Development Commands
- Install deps: `yarn` (Yarn 4; enable via `corepack enable` if needed).
- Start dev: `yarn dev` — runs Vite with CRX HMR.
- Build release: `yarn build` — type‑check + production build to `dist/`.
- Load in Chrome: open `chrome://extensions` → Developer mode → Load unpacked → select `dist/`.

## Coding Style & Naming Conventions
- Language: TypeScript + React; 2‑space indent; prefer named exports.
- Components use PascalCase (e.g., `src/app/components/PromptCombobox.tsx`).
- Hooks live in `src/app/hooks` and follow `use-*.ts` kebab‑case.
- Modules/services use kebab‑case (e.g., `src/services/chat-history.ts`).
- Styling: TailwindCSS + SCSS. Keep class names composable and utility‑first.
- Tools: Prettier 3 and ESLint (TS/React). Format before pushing (e.g., `yarn prettier --write .`).

## Testing Guidelines
- No formal test harness yet; validate changes manually:
  - Run `yarn dev`, load `dist/` as an unpacked extension, and exercise UI flows (chat, settings, history).
  - Verify i18n via `_locales` strings and dark/light themes.

## Commit & Pull Request Guidelines
- Use Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:` with a clear scope.
- PRs should include:
  - Problem statement and high‑level approach; link related issues.
  - Test plan (manual steps) and any migration/permission notes.
  - Screenshots/GIFs for UI changes (before/after).

## Security & Configuration Tips
- Do not hardcode API keys or secrets. Use user config/storage (`src/services/user-config.ts`).
- Minimize Chrome permissions; update `manifest.config.ts` intentionally when domains/permissions change.
