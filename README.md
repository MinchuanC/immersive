# Immersive

A personal macOS music player combining Folia and MineRadio's original visual systems with one shared music library and playback state.

The application source lives in `app/`. The frozen upstream references in `.references/` are research copies, not the product working tree.

- Design: [Source merge design](docs/superpowers/specs/2026-10-26-mineradio-folia-merge-design.md)
- Build plan: [Implementation plan](docs/superpowers/plans/2026-10-26-unified-player.md)
- Attribution: [Upstream provenance](app/UPSTREAM-NOTICE.md)

Build and open `app/release/mac-arm64/Immersive.app` on an Apple Silicon Mac. The default build is locally signed and is not notarized.

Use **Import your music** to choose a music folder, or connect your own Spotify account. Immersive can play Spotify through its embedded player or control Spotify Desktop. Embedded playback uses an unofficial Spotify client and a separate sign-in; it may violate Spotify's terms and affect account access. Spotify permission for this integration has not been established. Some Spotify features may require Premium and a personal Spotify Developer Client ID; the app shows the callback address for the latter.

Spotify sign-ins and settings belong to each user's local profile and are not included in this repository. Do not commit credentials, session data, or personal listening information.

The glass dock opens **Music library**, **Queue**, **Visual effects** (sparkles) and **Settings** (gear). The separate **Show player details** button opens song details, lyrics and playback controls; **Now playing** returns to the player. In Visual effects’ lyrics tab, choose **Folia** or **MineRadio** before adjusting that renderer. The command palette opens with Command-K or Control-K. Space plays/pauses; arrows seek; H cycles player chrome; Escape returns or closes the current panel.

From source, use Node24 or newer and Xcode:

```sh
cd app
npm ci
npm run dev:mac
```

To build the Mac app, stop the development app and run:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer npm run build:mac:dir
```

The packaging hook prepares and verifies FFmpeg, MNN, analysis models and Mac helpers. First preparation needs network access and can take several minutes.

Run `npm run build:mac` from `app/` to create an Apple Silicon DMG. Distribution requires review of third-party licenses and applicable Spotify permissions.
