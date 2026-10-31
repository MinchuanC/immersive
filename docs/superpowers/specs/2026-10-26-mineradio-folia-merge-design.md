# MineRadio + Folia — unified macOS player

Status: approved by the user's “now build the complete app” instruction on 2026-10-26. Implementation is tracked in `../plans/2026-10-26-unified-player.md`. This replaces the earlier custom cinematic-player design and disposable mockup.

## Goal and confirmed decisions

Build one coherent personal macOS music application by directly reusing the original UI, graphics, animation and feature implementations from MineRadio and Folia. Preserve their original visual detail rather than designing approximate substitutes.

The user clarified that this is a merged application, not two separately recreated applications or a switcher between full apps. They explicitly selected **Electron for direct reuse and visual fidelity**, replacing the earlier Tauri choice, and **Spotify plus local music files** as the sources. Spotify desktop may handle Spotify audio. The genuine-word-timing requirement remains: line timings must not be presented as genuine individual-word timing.

The target is the feature union that applies to those sources on this Mac. Keep each original visualizer, library presentation and advanced control rather than reducing the project to one sample lyric screen. Original-source functionality that needs another music provider, unavailable audio access or a Windows-native facility must have an explicit capability boundary.

## Pinned sources and provenance

| Source | Inspected revision | License declared by source |
|---|---|---|
| [MineRadio](https://github.com/XxHuberrr/Mineradio-paused) | `d43de565acabfdc1a9c9820a27e81a98ccbebcef` | GPL-3.0-only |
| [Folia](https://github.com/chthollyphile/folia-major) | `aecd330b720eb8fc728e6b10ebcec261b144d683` | AGPL-3.0 |

Original source checkouts are preserved under `.references/mineradio` and `.references/folia`. Preserve their LICENSE, NOTICE, author and third-party attributions when copying code. Record copied modules and local changes against these revisions. Do not silently turn the result into a proprietary relicensing or imply that the upstream authors shipped this merged build.

MineRadio's current original repository is named `Mineradio-paused`; its README says development is paused. Folia already has Electron macOS packaging and macOS desktop/wallpaper integration. These are source observations, not proof that the local merged app will run.

## One application and one state model

Use Folia's existing Electron/React application as the foundation in `app/`. Preserve its component structure, library core, visualizer registry, stores, localization, settings toolkit and tests. There is one Electron main process, one application navigation model, one canonical playback state, one queue and one library database. Do not embed the two complete applications in separate webviews/iframes.

Integrate MineRadio's graphics and controls as functional modules in that application. Its source fragments currently concatenate into one classic script and depend on fixed DOM IDs, shared variables, inline handlers and global listeners. Port the bootstrap and scope those dependencies at the integration boundary. Preserve shader, camera, geometry, timing and UI styling code wherever possible. Do not pretend selected files are independent React components.

Use Folia's existing visualizer/background registries and library-surface contracts instead of inventing a second plugin framework. Shared actions flow through Folia's playback/library ports. A MineRadio runtime adapter has an explicit mount/update/dispose lifecycle and releases listeners, WebGL resources and animation loops on unmount. It owns only its integrated scene/controls, not another application state.

Proposed playback-ownership default: explicitly playing the app queue gives the app responsibility for advancing it. Before starting a track from another source, pause and confirm the previous source has stopped so local and Spotify audio never overlap. Advance once on confirmed completion, not merely because a stale progress estimate reached the end. A track/playback change initiated outside the app, which does not match a pending app command, suspends automatic queue advancement and follows the external Spotify session; resuming the app queue is explicit. Do not replace a user's Spotify queue behind their back. If a source cannot provide a reliable completion signal, keep manual Next available and expose the automatic-advance limit instead of guessing. This resolves the builder review's queue-ownership question.

## Concrete UI and feature reuse map

| Unified area | Directly retained implementation | Integration decision |
|---|---|---|
| Full-window listening stage | MineRadio's Three.js cinematic camera, orbit/free camera, particle geometry and performance controls; Folia's persistent backdrop/foreground composition | One stage and one clock. MineRadio's background/preset system and Folia lyric renderers compose together. Changing a lyric style does not restart the backdrop. |
| Lyric styles | All 15 Folia styles, with their original tuning panels and transitions; MineRadio's single/dual/triple/cinema/custom layouts and glass/smooth/float/quick/shine/glitch treatments | Register the additional MineRadio lyric treatments in the same selection system. These are lyric presentation choices, not separate full-app modes. |
| Visual presets | MineRadio's 13 entries: Emily cover particles, tunnel, planet, void, record, star river, skull, Sonic Topography, Sonic Workshop, Eclipse Halo, Neon Drizzle, Prism Flock and Abyssal Bloom | Keep their original visual code and parameters. Expose them through the stage's visual controls; identify native-only dependencies per preset/import path. |
| Backgrounds | All six Folia backgrounds; MineRadio image/video layers, crop/zoom/opacity/color controls and visual archives | Share the backdrop owner. Keep local/custom media and original settings controls. Source-sensitive Spotify cover and synchronized-video restrictions are handled separately. |
| Home | MineRadio's dashboard hierarchy, continue/listening/library/recent/next-up cards and cinematic presentation | Feed real Spotify/local library state through the shared data layer. No invented recommendations or listening figures. Launch in the last view; a playing track can return directly to the stage. |
| Library | Folia grid and Bravais wall, Lattice queue/explore presentation, collections and artist surfaces; MineRadio 3D playlist shelf and animated card/detail interactions | All are views of the same library and queue. Shelf is an additional library presentation, with right-click and visible keyboard-accessible entry. Preserve original layout/motion within each view. |
| Playback controls | MineRadio's original glass dock, mini queue, seek/volume/repeat controls; Folia action menus and relevant controls | Use the MineRadio dock as the proposed default visual shell. Reuse Folia actions behind it; add unique controls once rather than running duplicate transports. Preserve alternate original layout options where they already exist. |
| Visual editing | MineRadio's six-tab visual console, presets, archives, history/undo and import/export; Folia Theme Studio and per-renderer tuning | One settings entry and shared persistence. Keep the console and studio's original internal controls. They serve different editing tasks inside the same app. |
| General settings | Folia's 13 settings categories and help; applicable MineRadio cache, interaction, gesture, shelf and system options | Merge unique controls into the existing settings structure. Reuse project controls and localization, preserving source defaults until deliberately changed. |
| Lyrics editing | Folia matching, offsets, segmentation/filtering and translation/romanization support; MineRadio custom LRC/text editing and per-track controls | One track identity and override record. Keep original editors and imported formats; retain timing provenance through rendering. |
| Local playback | Folia's audio engine, file/folder library, metadata, queue, audio effects and cache; applicable MineRadio fade/gapless/DJ/AutoMix behavior | One engine. Consolidate overlapping behavior into it and retain original feature controls. Analyse only actual app-owned decoded audio. |
| Extra app features | Existing source-independent command palette, sleep timer, OBS/browser-source export, remote window, Folium extension surfaces, gestures and desktop integration | Retain and connect applicable features to the shared state. Optional services/permissions remain user-enabled. No separate original app processes. |

The proposed defaults above settle overlapping layouts without claiming the user explicitly chose each individual control placement. Original donor components should remain visually recognizable and faithful. A combined page necessarily has a new arrangement where the two originals overlap; do not claim it can be pixel-identical to two different original pages simultaneously.

## Source and platform boundaries

### Spotify

Keep the agreed official Web API PKCE browsing plus Spotify-desktop playback connection. Use the user's Premium account and personal Developer app. Store credentials in macOS Keychain/main process, not renderer storage. Spotify handles output routing; do not force Connect transfers or add a device picker implicitly.

Neither upstream Spotify implementation is a drop-in match for that decision. MineRadio's adapter explicitly returns metadata-only tracks and switches to another source for audio. Folia uses private named queries and a separate audio/cache transport. Reuse their UI and normalized data models, replacing the transport. Do not silently match a Spotify selection to another service's recording.

Support the API-accessible search, saved albums/tracks and playlists. Owned/collaborative playlist contents are available under current new-development-mode rules; inaccessible collections get an actionable Open in Spotify state. Source-specific discovery, recommendations, editing and queue actions must follow actual account/API capabilities.

Spotify desktop state supplies timeline, pause and track identity, but not decoded PCM/FFT. Keep ambient graphics and lyric synchronization; mark actual beat-analysis, EQ, crossfade, gapless and AutoMix unavailable for this source when they require app-owned audio. Never fake FFT or beat detection from a progress clock. Keep Spotify cover art intact and attributed. Do not automatically enable source visual transformations or synchronized video behavior that conflicts with the platform requirements already researched.

### Local files

Local files use Folia's audio engine and real Web Audio signals, enabling the full relevant spectrum/beat/camera/particle features. Use existing folder/file authorization, metadata and lyric import flows. Test local playback transitions and the combined queue rather than maintaining both original audio engines.

Keep real timed words from supported lyric formats/provider records. Folia's plain LRC parser and MineRadio's untimed-text parser both estimate finer timing. Preserve that provenance and apply line-level/static rendering instead of presenting estimates as genuine word karaoke. Automatic lyric lookup can use LRCLIB with the previously researched validation/fallback rules; local overrides take precedence for the selected track.

### macOS and feature availability

Reuse Folia's macOS window, menu/tray and desktop/wallpaper mechanisms. MineRadio's WorkerW, DWM/PowerShell, desktop-icon shields, system-memory purge and native Wallpaper Engine scene host are Windows facilities; they cannot be copied into macOS as working features. Preserve portable graphics and local video/image imports. Display clear unavailable states for controls with no supported Mac equivalent.

Preserve optional camera gestures and their permission/lifecycle controls; do not turn on a camera during setup or source inspection. Keep remote/OBS/mod integration user-enabled. Other music-service login/catalogue flows are outside the user's selected Spotify-plus-local source scope, rather than pretending to provide them through Spotify.

Disable automatic application of upstream release updates in this fork. Use a distinct app identity and data directory so a local build cannot overwrite an existing Folia or MineRadio installation/profile. Do not alter either reference checkout as the product working copy.

## Verification and completion

Before changes, run the relevant upstream test baselines. Preserve existing test suites. Add regression checks at the new boundaries: shared playback/queue actions, exclusive audio ownership and cross-source handoff, external Spotify changes suspending queue ownership, duplicate/stale end notifications, source capabilities, time-unit conversion, genuine-vs-estimated lyric timing, stale requests, persistence and runtime cleanup.

Use original source pages/renderers as visual baselines. For each retained UI surface, compare the original and merged version using the same viewport, fonts, theme, sample content, preset and animation time. Check complete screens and hover/focus/active/editor states, not just a homepage screenshot. Keep a parity checklist with a status and evidence for every area in the reuse table; source-code presence alone does not count as working parity.

Verify one packaged macOS app: local import/play/seek/skip/queue; Spotify authorization/browse/select/playback observation; stage/background/style handoff; 3D shelf and library navigation; settings persistence and profile import/export; keyboard/fullscreen/reduced motion; resource cleanup and performance. Test native Automation consent in the packaged app. Check optional features with their actual permissions/backends before marking them working.

Use 960×640 minimum, 1280×800, 1440×900 and 1920×1080/fullscreen, including Retina. Preserve original visual detail unless a concrete interaction, clipping or accessibility defect requires a documented surgical change. Generic taste rules do not authorize restyling the user's chosen donor UI.

## Inspection evidence and present limits

- MineRadio renderer dependency order/global coupling: `public/js/index-loader.js:5–127`.
- MineRadio visual presets: `public/js/modules/07-fx/00-preset-archive-data.js:2`.
- MineRadio 3D shelf: `public/js/modules/04-shelf/01-manager-core.js`; native bridge: `desktop/preload.js:3`.
- MineRadio lyric adapter: `applyLyricsState` and `parseYrcText` in `public/js/modules/06-lyrics/00-lyrics-fetch-parse.js`; audio graph in `05-playback/08-audio-graph-controls.js`.
- Folia registries: `src/types/visualizerModes.ts:15–40`, `src/components/visualizer/registry.tsx`, `src/library/registry.ts`.
- Folia scene contract: `src/components/visualizer/definition.ts:64`; persistent stage: `VisualizerBackdrop.tsx` and `VisualizerRenderer.tsx`.
- Folia library action ports: `src/library/core/shared/ports.contract.ts:9`; settings registry: `src/components/modal/settings/pages/index.ts:25`.
- Folia existing Spotify boundary: `src/services/onlineMusic/spotify/spotifyTransport.ts:8`; estimated lyric timing: `src/utils/lyrics/parserCore.ts:59`.

The original MineRadio public renderer was served without installing dependencies. Its actual home/dashboard, glass transport and visual preset console were inspected in a browser; screenshots are in `.references/mineradio-startup.png` and `.references/mineradio-fx.png`. Missing backend requests produced expected errors, so this was visual inspection, not authenticated playback verification. Folia source, representative tests and original renderer screenshots were inspected; its desktop app was not launched. Neither repository's full test suite, live account integration, gestures or native desktop mode has been run.

After this design is approved, write the implementation plan against this source reuse map, then build the integrated application. The earlier custom preview is not the implementation target.
