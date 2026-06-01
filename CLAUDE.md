# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Glitch Run" — a mobile-first PWA endless-runner game (synthwave aesthetic, Romanian UI). It is a static site with **no build step, no dependencies, no test suite, and no linter**: just `index.html`, `style.css`, `game.js`, `manifest.json`, `sw.js`, and `icons/`. Everything ships as-is to GitHub Pages.

## Run / develop / deploy

- **Run locally:** serve the repo root over HTTP (required for the PWA manifest and pointer events), e.g. `python3 -m http.server 8000`, then open `http://localhost:8000`. Opening `index.html` via `file://` will not behave correctly.
- **No tests/lint/build.** Verify changes by playing the game in a browser (preferably mobile emulation / portrait) — golden path plus edge cases.
- **Deploy:** automatic via `.github/workflows/pages.yml` on push to `claude/salutare-feature-wwUIO` or `main`. The workflow uploads the repo root as the Pages artifact — there is no compile/bundle stage, so what you commit is what ships.

## Architecture

The entire game lives in `game.js` (~3000 lines) inside a single IIFE. There is no module system. Notable internal pieces, roughly in file order:

- **`audio`, `music`, `haptics`** — fully procedural. Sound effects (Web Audio oscillators/noise), one synthwave track per level (`SONGS` table of chords/bass/kick patterns), and Vibration API haptics. **There are no audio/image asset files** beyond the two PWA icons; everything else is generated at runtime.
- **`store` + `save(k, v)`** (~line 665) — the only persistence layer. localStorage, all keys namespaced `glitchrun.v1.*` (best, coins, skin(s), runs, stats, achievements, missions, dailyStreak, lastDaily, mute, muteMusic). Always go through `save()`.
- **`CONFIG`** (~line 683) — physics/tuning constants (gravity, jumpV, coyote time, etc.).
- **Data tables:** `SKINS`, `ACHIEVEMENTS`, `MISSION_DEFS`, `LEVELS`. Add content by extending these arrays.
- **`state`** (~line 805) — all mutable runtime state (`mode`: menu|playing|paused|dead, entity arrays for obstacles/coins/particles/powerups/floaters, camera/shake, etc.).
- **Game loop:** `frame(now)` (~line 2470) is the single `requestAnimationFrame` driver. It computes `dt` (**clamped to 0.05s** to prevent collision tunneling after tab-switches/lag), then calls `update()` then `render()`.
- **Lifecycle / UI:** `startRun()`, `endRun()`, `showScreen(name)` (home/shop/missions/stats screens, driven by the bottom nav in `index.html`). Input is pointer-based: `onPointerDown`/`onPointerUp` interpret tap / swipe-up = jump, double-tap = double jump, swipe-down = slide.

`index.html` is the UI shell: HUD, all overlays (start, game-over, shop, missions, stats, ad), and the bottom nav. `style.css` styles all of it.

## Critical conventions & gotchas

- **Pacing is driven by `state.dist`, NOT `state.score`.** `dist` increments a steady +1/frame and is the *sole* input to level-up, run speed, spawn cadence, and set-piece timing. `score` is purely the displayed leaderboard number (distance + coins). Keep them decoupled — keying any pacing off `score` reintroduces the bug where a coin burst (e.g. Coin Rush) spikes difficulty instantly.
- **Cache-busting version numbers.** `index.html` loads `game.js?v=N` and `style.css?v=47`-style query strings. **Bump the `v` number in `index.html` whenever you change `game.js` or `style.css`**, or browsers/Pages will serve stale files.
- **No active service worker.** `index.html` deliberately *unregisters* any service worker and clears all caches on load; `sw.js` is a self-destructing kill-switch (recovery from a previously cached build), not a caching SW. Do not re-enable SW caching casually.
- **Strict CSP & no network.** `index.html` sets a tight Content-Security-Policy (`default-src 'self'`, inline script/style allowed, no external `connect-src`). The game makes no network requests and uses no third-party assets. If you add anything external you must update the CSP — but prefer keeping everything local/procedural.
- **Simulated ads.** The "REVIVE" / "2× STELE" ad overlays are fake (a countdown), not a real ad SDK.
- **UI language is Romanian.** Match existing copy when adding user-facing text.
