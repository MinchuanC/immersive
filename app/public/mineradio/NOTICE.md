# MineRadio visual integration

Source: https://github.com/XxHuberrr/Mineradio-paused at d43de565acabfdc1a9c9820a27e81a98ccbebcef.

The particle geometry, 13 presets, shader source, camera, 3D collection shelf, lyrics graphics, visual console, and dock are extracted directly from the GPL-3.0 donor. See LICENSE. Original source file boundaries remain in donor-engine.js. The extraction intentionally excludes the original application bootstrap, playback engine, accounts, provider transports, and home/navigation runtime. Folia owns these capabilities and sends validated state through stageBridge.ts.

Regenerate donor assets from the frozen checkout with node src/integrations/mineradio/extractDonor.mjs. stagePrelude.js, stageRuntime.js and stage.css are the integration boundary. Sonic Workshop retains its upstream graphics-only iframe.
