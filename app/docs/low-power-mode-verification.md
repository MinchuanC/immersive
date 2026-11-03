# Low Power mode verification

Verified on 2026-11-03 against base `bce6dcf5b8ce7e9e106a6e87cc6db11ef9d55a8c`.

## Behavior

Low Power is a manual, remembered toggle in Settings → Performance & motion and the command palette. Standard remains the default. The operational preference is separate from appearance import/export and saved scene tuning. Turning it off restores the latest tuning, including changes made while it was on.

Visible Low Power keeps lyric resolution, scene speed, camera movement and UI animation. MineRadio samples decorative point geometry over its full extent and omits its extra bloom pass. Latent and Nomand reduce only their background shader pixel budgets. Common, Monet and Sora retain their existing visible rendering budgets. No global frame cap or reduced-motion setting is introduced.

Hidden/minimized Low Power uses the existing native visibility policy, explicitly holds MineRadio rendering, stops Latent shader clocks and cancels Monet drift. Audio continues; restoration updates lyrics and scenes to live playback time. A visible, unfocused window continues drawing. Wallpaper, video export and connected OBS retain their existing stand-down exceptions. The separate Background throttling preference is never rewritten.

## Production measurements

Apple M3 Pro, macOS 27.2, Electron 43.7.5 arm64. Both builds used the production bundle (`ELECTRON_DEV=false`, `file:` URL, no Vite or DevTools), in unbundled Electron with isolated profiles. This is not a packaged/release-app test. Window size was 1440×900; observed display cadence was approximately 120 Hz. Each scene/state used three alternating Standard/Low Power pairs, 1.2 seconds warm-up and 3 seconds measured per sample. No build or test suite ran during sampling. The fixture was the same generated 45-second local audio, cover and timed lyrics, reset to 12 seconds each run.

CPU is the sum of Electron process cumulative CPU-time deltas divided by wall time: 100% means one full CPU core. Values are median (minimum–maximum). GPU-process CPU is included in that sum; it is **not GPU utilization**. These short samples are resource proxies, not battery-energy measurements.

| Lyrics / background | State | Standard CPU % | Low Power CPU % |
| --- | --- | ---: | ---: |
| MineRadio / MineRadio | Playing | 90.6 (88.7–92.0) | 91.0 (80.7–92.1) |
| MineRadio / MineRadio | Paused | 62.6 (60.8–67.3) | 64.3 (63.6–65.4) |
| MineRadio / MineRadio | Hidden playing | 86.8 (86.2–88.5) | 27.1 (26.2–27.3) |
| Sonnet / MineRadio | Playing | 91.4 (88.4–97.5) | 95.7 (91.6–100.2) |
| Sonnet / MineRadio | Paused | 60.7 (51.4–64.0) | 61.0 (60.6–72.2) |
| Sonnet / MineRadio | Hidden playing | 87.1 (86.6–91.2) | 28.0 (26.9–28.1) |
| Sonnet / Latent | Playing | 92.9 (85.0–93.6) | 91.5 (89.9–93.7) |
| Sonnet / Latent | Paused | 64.5 (63.1–71.0) | 64.8 (63.1–66.5) |
| Sonnet / Latent | Hidden playing | 84.0 (81.9–86.2) | 27.0 (26.7–30.4) |
| Sonnet / Nomand | Playing | 85.3 (83.1–95.6) | 87.0 (86.7–87.4) |
| Sonnet / Nomand | Paused | 20.9 (19.2–22.8) | 20.6 (20.5–22.1) |
| Sonnet / Nomand | Hidden playing | 80.7 (74.3–84.2) | 27.7 (25.5–28.2) |

Hidden median CPU fell approximately 66–69%. Actual MineRadio draw counters and Latent shader clocks stopped while hidden, and audio advanced throughout. The main window's RAF could still run at 120 Hz on this Mac even when minimized; it is not used as proof that GPU draws stopped.

Visible CPU ranges overlap; this experiment does not establish a visible CPU improvement. The measured graphics-work reductions were:

- MineRadio default fixture: 33,489 → 8,373 submitted points (75% fewer). The separate bloom-enabled scene fixture was 66,978 → 8,373 (87.5% fewer). Lyric mesh, canvas DPR, scene extent, animation and saved settings stayed intact.
- Latent: each of two canvases changed from 1214×759 to 607×379 (about 75% fewer pixels).
- Nomand: 1821×1138 → 607×379 (about 89% fewer pixels). Its five current effects have zero shader speed, so this mainly reduces buffer/repaint cost; it does not imply ongoing CPU savings.
- Sonnet's separately rendered canvas stayed 1638×1024 in the isolated canvas check. Shader mounts remained connected, clocks did not reset, and Standard dimensions restored exactly.

## Standard before and after

The exact base commit was built with the same production flags and harness. All four scenes and three states matched Standard's submitted points, canvas DPR and pixel dimensions. They retained approximately 120 Hz cadence (361–363 main-window callbacks per three-second sample). Baseline CPU results with its independently seeded profile were:

| Scene | State | Pre-feature Standard CPU % |
| --- | --- | ---: |
| mineradio-lyrics | playing | 73.2 (56.9–80.2) |
| mineradio-lyrics | paused | 38.3 (37.0–40.1) |
| mineradio-lyrics | hidden | 67.3 (57.7–78.8) |
| sonnet-mineradio | playing | 87.4 (83.9–90.2) |
| sonnet-mineradio | paused | 51.3 (44.4–53.9) |
| sonnet-mineradio | hidden | 89.7 (88.3–93.0) |
| sonnet-latent | playing | 101.9 (101.4–111.5) |
| sonnet-latent | paused | 71.4 (56.5–75.1) |
| sonnet-latent | hidden | 99.9 (96.6–104.2) |
| sonnet-nomand | playing | 90.3 (86.3–93.8) |
| sonnet-nomand | paused | 16.5 (12.7–20.3) |
| sonnet-nomand | hidden | 94.3 (93.0–95.5) |

The first MineRadio comparison varied substantially between launches, so it was repeated with a copy of the exact generated feature profile and Low Power off. Paused CPU was 65.9% (55.6–67.5) on the baseline versus 65.6% (51.3–68.0) on the feature branch. Playing medians were 90.7% versus 83.6%; hidden medians 89.0% versus 77.3%, respectively. The evidence does not indicate a sustained Standard CPU regression, but short samples cannot prove equivalence on every machine. Raw repeat files: `baseline-matching-profile.json` and `standard-repeat.json`.

The reported graphics reductions apply to the representative fixture and targeted decorative geometry; they are not a claim of uniform savings across all 13 MineRadio presets.

## Regression and lifecycle checks

- New persistence, bridge, command, background-budget and native-policy tests were observed failing before implementation and passing afterward.
- Real WebGL smoke passed all 13 presets in both Standard and Low Power, including GPU/RAF/timer/listener cleanup, 20 mode round trips, scene/settings changes while Low Power was active, full geometry extent, preserved lyric mesh/DPR, hidden zero draws, and live-clock restoration. Sonic Workshop's child rendering realm also held while hidden.
- Native production checks passed visible focus loss, invalid preference rejection, video-export stand-down, a live local OBS connection, and minimized playback across a lyric boundary. After restoration: audio 23.241s, scene 23.217s, lyric clock 23.199s, expected lyric index 2. Wallpaper stand-down was unit tested, not activated on the desktop.
- The remembered preference survived isolated app relaunch. Appearance export excludes it, and importing appearance fields cannot overwrite it.
- Generated local playback smoke passed import, actual playback, pause, keyboard seek, next track and paused session restoration.
- Typecheck and production build passed. Full unit suite: **1,040 files passed, one skipped; 12,727 tests passed, two skipped** (`npm run test:unit -- --maxWorkers=4`). Two unrestricted runs hit the existing settings-window setup hook's 10-second timeout; that test passed 3/3 alone, and the complete suite passed with bounded concurrency and the Electron fixture closed. No test timeout or product behavior was changed. Existing jsdom CSS warnings and three obsolete stored-settings snapshots are unrelated and unchanged.
- The archive camera smoke fixture previously collected a stale preset-change message; this also reproduced on the untouched baseline. The fixture now listens only after setup messages drain. Production camera code was not changed.

## Independent review follow-up

The fresh whole-branch review found no production defect and two Important verification gaps. Both were addressed with test/probe changes, without changing production behavior:

- `lowPowerLyricParity.mjs` observes Sonnet's real Pixi glyph transforms at nine matched media times across the 10s and 20s line transitions in Standard → Low Power → Standard. The maximum pose difference was zero, with identical canvas identity/resolution and multiple distinct visible glyph poses. Live playback additionally observes actual renderer calls and moving glyph poses; both Sonnet and MineRadio retained approximately 120 renders/second through the switches. MineRadio crossed the same lyric boundary, retained its mesh and actual row texture quality, and never reset lyric entrance age or its animation clock. This uses renderer output, not the independent RAF counter from the CPU probe.
- The stage smoke now samples post-GC heap, DOM/listener counts, pending RAF callbacks, and live GPU geometries/textures before, during and after 20 warmed round trips. Samples at rounds 0/5/10/15/20 retained 459 listeners, 3,289 DOM nodes, seven geometries, nine textures, one pending RAF and zero held callbacks. Retained heap ranged from 6.06 to 6.24 MB, within the explicitly bounded warm-up/GC allowance (5% plus 256 KiB).
- Negative controls confirmed the checks fail for an intentionally accumulating listener and an intentionally displaced Low Power glyph. Those test-only faults were removed and the unmodified probes passed. The archive camera fixture now drains earlier posted messages with a queue sentinel before observing restoration.

The reviewer left these boundaries explicit: existing Sonnet clipping, absolute energy/GPU-utilization gains, packaged installation/live Spotify/other OS testing, uniform savings for mods or arbitrary embedded scenes, and unrestricted-suite setup-hook contention. Delayed native-snapshot races were inspected but no actual ordering defect was established; that ordering is not separately simulated here. No second review was performed after the verification-only pass.

Raw follow-up evidence: `test-results/low-power/lyric-parity.json` and `test-results/low-power/verification/review-*.log`.

## Reproduce

From `app/`, using installed dependencies:

```sh
npm run typecheck
npm run test:unit
node test/unit/mineradio/stageSmoke.mjs
node test/unit/mineradio/stageSmoke.mjs --low-power
ELECTRON_DEV=false ELECTRON=true APP_RELEASE_CHANNEL=internal APP_VERSION_LABEL=Immersive node node_modules/vite/bin/vite.js build
node skills/run-desktop/driver.mjs serve --production --lang en
```

In another terminal, run `node dev/probes/immersive/localPlaybackSmoke.mjs`, then `node dev/probes/immersive/lowPowerAcceptance.mjs`, `node dev/probes/immersive/lowPowerNativeSmoke.mjs`, and `node dev/probes/immersive/lowPowerLyricParity.mjs`. Close the fixture with `node skills/run-desktop/driver.mjs quit`. Use the same harness/probe with `--baseline` against an archive of the base commit to compare pre-feature Standard. Never sample while builds or other tests run.

Local raw samples are in `test-results/low-power/feature.json` and `baseline.json`; screenshots are in `test-results/run-desktop/shots/`. These ignored artifacts use generated media only. No provider login, installed app, packaged build, battery watt-hours or per-app GPU utilization was tested. Existing Sonnet clipping is outside this change and remains visible in the same baseline layout.
