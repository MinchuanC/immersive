# Immersive Player — design for review

Status: superseded by `2026-10-26-mineradio-folia-merge-design.md`. The user replaced the custom visual direction with direct MineRadio/Folia source reuse and selected Electron with Spotify plus local files. Product implementation has not started.

## Intent and decisions

Build a personal macOS Spotify browsing client whose main experience is a cinematic, full-window lyric performance. The user explicitly rejected a basic player/library presentation. The player should feel visually rich: an atmospheric background, translucent layers, large expressive lyrics, and convincing depth.

The user selected:

- Spotify as the music source, with Premium and one-time personal Developer app setup acceptable.
- Browsing/search/library inside this app, with Spotify desktop running for audio.
- Tauri 2 and React rather than SwiftUI.
- A dimmed scene inside the app, rather than transparency through to the Mac desktop.
- Cinematic imagery with ambient graphics.
- Kinetic words when genuine timing data exists, with line-synced fallback.
- Personal use on this Mac; public distribution is outside the initial build.

## Visual design

The concept: **the current lyric becomes the focal point of a cinematic scene.**

The stage fills the window edge to edge. Original scenic imagery sits under a default 50% dark veil. Gentle light, atmospheric particles and pointer depth add movement independently of the music. Oversized lyrics occupy the central/right area; the current phrase comes forward while nearby lines recede. Timed words illuminate and lift. Motion and contrast must preserve reading order.

A compact bottom transport shelf contains intact album artwork, track/artist metadata, progress, playback controls and access to the library. It recedes after three seconds of inactivity, but remains visible while controls or panels hold focus. Pointer or keyboard activity reveals it. Album artwork is separate from the background and is not cropped, blurred, distorted or covered with text.

The library opens over the same scene. Opening search, an album or settings must not stop audio, reset the scene, or flash a blank background. Browse panels use quiet glass surfaces; the listening stage remains the dominant identity. Avoid piling all neon, hologram and particle effects into one view.

Use one finished lyric composition initially. Start with two original scenic backgrounds, dark system sans typography with bright readable lyrics, and one consistent icon family. Background dimming is adjustable. These are proposed defaults, rather than choices the user explicitly made.

References inspected:

- [Folia](https://github.com/chthollyphile/folia-major): kinetic lyric composition, large active phrases, continuous background across layout changes.
- [Lyra — DhruvHarani1](https://github.com/DhruvHarani1/lyra): full-window cinematic scene, dark scrim, large word-focused lyrics. The user confirmed this Lyra. Its estimated word timings are excluded from our design.
- [Cadence](https://github.com/MowkE/cadence): glass, refractive light and selective perspective/depth. Its screenshots show a desktop overlay; we will implement this language inside our own scene.
- [LyricFever](https://github.com/aviwad/LyricFever): macOS Spotify integration and native fullscreen behavior.

These are visual references, not a request to clone their source or streaming integrations. YesPlayMusic is not a visual target.

## Browsing and playback

Include search for tracks, albums, artists and playlists; saved tracks/albums; the user's playlists; album tracks; and artist albums. Paginate search and large collections. Read playlist contents where the account's development-mode access allows it. For inaccessible external playlists, show metadata and an Open in Spotify action, not a misleading empty track list.

Transport includes play/pause, previous/next, seek, volume, shuffle and repeat to the extent exposed by Spotify desktop. Selecting a browsable item plays its Spotify URI/context. Spotify desktop handles audio and output routing; the app follows the session it exposes. The initial version has no Connect device picker and does not force transfers between outputs. This resolves the reviewer's output-routing question as a proposed default.

Playback observation is authoritative. Sample Spotify desktop state about once a second while active, interpolate display progress using monotonic elapsed time only during playback, and resynchronize after seeks and track changes. Keep scripting and network requests off the rendering thread. Verify position/duration units against real playback before relying on them.

Do not add editorial recommendations, removed discovery endpoints, playlist editing, a separate queue manager, offline audio, standalone streaming or other music services in the first build.

## Lyrics and states

Look up lyrics from LRCLIB using title, artist, album and duration. Where valid Lyricsfile 1.0 word timestamps exist, use them. A nonempty word array or `hasWordSync` flag alone is insufficient. Use supplied end times for a continuous sweep; otherwise activate words at their genuine starts without inventing durations. Lines without usable word timing keep line-level emphasis.

Fallback order: validated timed Lyricsfile, synchronized LRC, plain text, then instrumental/unavailable. Unsupported or malformed YAML and unresolved offset semantics must fall back rather than produce guessed timing. Allow a local `.lrc` import to override a missing or incorrect match for a track. One small safe YAML parser is justified; do not build a multi-provider system.

Cancel obsolete requests and clear the old lyric/art state when tracks change. Missing lyrics, wrong-recording matches, ads, episodes and unsupported local tracks must not display the previous song's lyrics. Lyrics-service failure must never interrupt Spotify audio. Genuine word-sync coverage is not guaranteed.

## Implementation boundary

React/TypeScript owns presentation and the lyric clock. A narrow typed Tauri bridge provides authentication, browsing, Spotify desktop snapshots and validated playback actions. Rust owns Spotify HTTP requests, OAuth PKCE, refresh and macOS integration. Do not expose tokens or arbitrary shell commands to the frontend.

Store refresh credentials in macOS Keychain. Use no client secret. Complete authorization in the system browser using the documented numeric-loopback redirect exception, with state validation and a temporary callback listener. A public Client ID is configured once. Disconnect removes credentials and Spotify-derived caches while preserving user files.

Use fixed AppleScript via `/usr/bin/osascript`, without shell interpolation. Pass validated Spotify arguments separately. Package the Apple Events usage description and automation entitlement. Test Automation consent using the built `.app`, because development processes can have a different privacy identity. The personal build initially stays outside App Sandbox.

Use CSS transitions and standard browser graphics primitives before adding animation engines. Keep the background renderer separate from lyric state; do not rerender React every animation frame. Reduce rendering work when hidden or minimized. Provide static graphics fallback, visible keyboard focus, sufficient composite contrast, text wrapping for English/CJK, and reduced-motion behavior that keeps current-lyric emphasis while removing travel and ambient movement.

## Success criteria

- A packaged app connects to the real account, browses allowed collections, selects a song and controls Spotify desktop.
- Real pause/seek/skip transitions keep progress and lyrics correct without stale frames.
- Word fixtures demonstrate genuine word activation; a live word-synced track is checked when available without claiming universal coverage.
- Unit checks cover OAuth state/refresh failure, URI validation, timing normalization, lyric parsing/fallbacks and stale responses.
- Visual review covers 1280×800, 1440×900, 1920×1080, fullscreen/Retina and a minimum 960×640 window; keyboard navigation, 200% text size and reduced motion remain usable.
- Authentication failure, denied Automation consent, Spotify absent/closed, network failures and restricted playlists have actionable states.

## Verification boundary and sources

Repository screenshots and owning READMEs were inspected. The installed Spotify scripting dictionary was read. Official Spotify/Tauri/Apple integration documentation and LRCLIB schema were researched. No account authorization, real playback command, packaged-app consent or word-synced live recording has been tested yet.

- [Spotify development-mode migration](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide), [July 2026 changes](https://developer.spotify.com/documentation/web-api/references/changes/july-2026)
- [Spotify design requirements](https://developer.spotify.com/documentation/design), [Developer Policy](https://developer.spotify.com/policy)
- [PKCE](https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow), [redirect rules](https://developer.spotify.com/documentation/web-api/concepts/redirect_uri)
- [Tauri macOS entitlements](https://v2.tauri.app/distribute/macos-application-bundle/#entitlements)
- [LRCLIB API](https://lrclib.net/docs), [Lyricsfile specification](https://github.com/tranxuanthang/lyricsfile/blob/main/SPECIFICATION.md)

The requested browser preview is a disposable design artifact with simulated content, not a working Spotify application. After design approval, write the implementation plan before product code.
