# Unified Immersive Player Implementation Plan

**Goal:** Build and package one macOS music player directly combining Folia's complete application and MineRadio's visual UI, with Spotify desktop and local music playback.

**Architecture:** Folia's pinned React/Electron source is the application foundation in `app/`. MineRadio's original scene, controls and shelf are integrated render modules sharing Folia's canonical playback/library state. Official Spotify browsing/authentication and macOS desktop control replace the original private Spotify audio transport.

**Tech Stack:** Existing Electron, React, TypeScript, Vite, Framer Motion, Three.js, Pixi, Vitest and Playwright from the pinned upstream source. Use macOS Keychain-backed credential storage, fixed AppleScript and OAuth PKCE.

**Spec:** `docs/superpowers/specs/2026-10-26-mineradio-folia-merge-design.md`, approved by the user's “now build the complete app” instruction.

## Global Constraints

- Personal macOS app; Electron and Spotify plus local music files are confirmed.
- One application, queue, navigation and settings state; no two complete apps embedded in a switcher.
- Directly preserve donor visuals, renderers, presets, tuning controls and licenses; adapt boundaries rather than approximate their appearance.
- Genuine word timings only; line and untimed lyrics retain honest fallbacks.
- Spotify desktop handles Spotify audio. No guessed FFT, cross-service song substitution or private Spotify audio cache.
- Reference checkouts stay unchanged. Product uses an independent application identity and user-data directory.
- `app/` is already the product tree. Do not copy upstream Folia into `app/` again.
- No public release, automatic upstream update installation, or account credentials in source.

## Review Focus

- Switching local/Spotify sources must not leave two audible players or advance twice after a stale end event.
- Outside Spotify changes suspend app-owned queue advancement instead of overriding the user's session.
- Invalid lyric timings, malformed metadata and rapidly changing tracks must not animate stale or invented words.
- Repeated scene/style changes must release graphics/listeners without resetting the shared playback clock.
- Packaged macOS permissions, missing credentials and missing native assets must yield actionable states rather than an apparently connected player.

## Task 2: Connect official Spotify and exclusive playback ownership

**Files:** `app/electron/spotifyDesktop/`; existing Spotify provider/transport files; new renderer playback hook under `app/src/components/app/spotifyDesktop/`; targeted preload/main/type integration; `app/test/unit/spotifyDesktop/`.

**Interfaces:** expose typed `spotifyDesktopRequest(operation, params)` through preload. Operations cover configure/status/login/logout/search/library/playlist/album/artist and validated playback actions. Playback snapshots carry track URI, metadata, duration/position in milliseconds, state, volume, shuffle/repeat and observed sample time. Renderer normalization converts to Folia's seconds-based motion signals.

- [ ] Write failing tests for PKCE state mismatch, callback timeout/cancellation, refresh failure, URI/action validation and milliseconds/seconds conversion.
- [ ] Implement main-process PKCE on numeric loopback, system-browser authorization, secure refresh storage and official Web API pagination/rate-limit handling. No client secret or renderer token exposure.
- [ ] Implement fixed `/usr/bin/osascript` commands with validated separate arguments. Report not-installed/not-running/permission-denied states. Use no arbitrary shell execution.
- [ ] Adapt existing Spotify UI/provider contracts to official search/library/playback. Keep source capability errors explicit; never request the upstream private audio transport or silently match another service.
- [ ] Add source ownership to the common playback path: pause/confirm old source before a switch; confirm completion before advancement; outside changes suspend app-queue ownership. Test rapid handoff, stale responses and duplicate completion notifications.
- [ ] Verify fixture tests and the packaged native consent identity; leave real sign-in clearly pending until the user completes OAuth. Commit the slice.

## Task 3: Transplant MineRadio's visual runtime into the shared stage

**Files:** `app/src/components/visualizer/backgrounds/mineradio/`; matching source/tuning settings; licensed assets under `app/public/mineradio/`; an integration module under `app/src/integrations/mineradio/`; focused runtime tests.

**Interfaces:** a mounted scene receives Folia's current time, pause/metadata, actual audio signals, lyrics, collection snapshot, persisted visual configuration and shared playback/library callbacks. Its handle provides update and dispose. The integration is a dedicated renderer, not a full MineRadio application. Preserve the vendor Three r128 boundary where required rather than changing original shader APIs blindly.

- [ ] Pin/copy original graphics, presets, shader assets, shelf, dock/console styles and notices. Inspect the original module dependency order and isolate its DOM/global dependencies.
- [ ] Write a lifecycle/bridge test that mounts, updates playback/time, dispatches a shared shelf action and disposes without retained listeners or animation loops.
- [ ] Implement the scoped runtime and register its presets/background and lyric treatments through Folia's existing registries. Keep original scene/camera/geometry code and console control values.
- [ ] Feed real local-audio bands/beat data. Spotify mode uses independent ambient rendering and disables unsupported analysis-dependent actions with an explanation.
- [ ] Preserve MineRadio's shelf geometry, card motion, wheel/right-click/keyboard entry, and details through the shared library action ports. No duplicate queue or provider login runtime.
- [ ] Compare source and integrated screenshots at matching viewport/preset/content. Test repeated mount/style changes and commit.

## Task 4: Complete the unified home, library, dock and settings

**Files:** new integration UI beside `app/src/components/app/`; existing player host, library registry and settings registration points; original locale files; source provenance/parity checklist.

**Interfaces:** all original surfaces call the same library/playback controllers. Default dock uses MineRadio's visual shell; Folia's unique actions/menus remain reachable. One settings entry leads to Folia settings, renderer tuning, Theme Studio and the integrated MineRadio console.

- [ ] Connect MineRadio's home/dashboard layout to real saved/local/recent/next-up resources, preserving original visual treatment and truthful empty states.
- [ ] Keep Folia grid/Bravais/Lattice and register MineRadio shelf against the same collections and selection state. Preserve local import/edit/export/search/sort and applicable playlist operations.
- [ ] Integrate the glass dock and unique Folia controls once; ensure play/seek/volume/shuffle/queue state stays synchronized across views.
- [ ] Retain all existing lyric/background styles and applicable app-independent features: Theme Studio, settings transfer, command palette, sleep timer, OBS/remote/mod surfaces and native desktop integration.
- [ ] Limit visible music-source choices to Spotify/local. Keep platform/source capability messages for unsupported native Windows facilities or audio-dependent controls; do not add decorative dead controls.
- [ ] Verify original existing player/library/settings browser tests plus keyboard, long text, resizing and reduced motion. Commit.

## Task 5: Preserve lyric provenance and complete matching/fallbacks

**Files:** `app/src/utils/lyrics/`, existing lyric result/normalization boundaries; a focused LRCLIB service; corresponding `app/test/unit/lyrics/` tests.

**Interfaces:** carry timing granularity through normalized lyric data. Renderers use genuine word timing, line timing, or untimed text deliberately; Folia's `Line`/`Word` time unit remains seconds. Local overrides are associated with the shared track identity.

- [ ] Write failing tests for genuine TTML/YRC word data, plain LRC estimated words, untimed text, malformed payloads, per-track offset and stale track lookups.
- [ ] Keep upstream parsers/format coverage, while preventing their estimated timings from becoming genuine-word karaoke. Verify all retained renderer families accept the line fallback.
- [ ] Add LRCLIB signature lookup and validated Lyricsfile/LRC/plain fallback; bound parsing, reject malformed timestamps and preserve supplied start/end semantics. Use one safe YAML parser only if required by the deployed payload.
- [ ] Connect existing matching/import/edit/translation/offset controls to shared overrides and error states without breaking audio.
- [ ] Run the focused parser and rendering-boundary tests, then commit.

## Task 6: Verify, package and hand over the actual Mac app

**Files:** macOS package scripts/resources; root running instructions; parity and verification report.

- [ ] Run typecheck, relevant unit suites and existing browser tests. Fix integration regressions; distinguish upstream baseline failures with evidence.
- [ ] Exercise real local audio import/play/pause/seek/skip, shared queue, stage presets/styles, 3D shelf, editing and settings persistence in Electron.
- [ ] Verify the official Spotify connection states and control bridge; complete live account checks when OAuth is available. Test denied native permission and unsupported capabilities rather than substituting demo playback.
- [ ] Inspect 960×640, 1280×800, 1440×900 and 1920×1080/fullscreen, Retina, keyboard focus and reduced motion. Confirm source fidelity and no blank background during transitions.
- [ ] Build an arm64 macOS `.app` with attribution and required usage descriptions/entitlements. Launch the packaged artifact and check its console, resource loading, local files and profile isolation.
- [ ] Review the whole change in a fresh same-model reviewer lane, resolve actionable findings, and provide the app path, launch instructions and exact remaining verification limits.
