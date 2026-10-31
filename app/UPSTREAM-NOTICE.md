# Immersive — upstream source provenance

This personal macOS application combines modified source from:

- Folia, by chthollyphile and contributors: https://github.com/chthollyphile/folia-major, revision `aecd330b720eb8fc728e6b10ebcec261b144d683`, AGPL-3.0.
- MineRadio, by XxHuberrr and contributors: https://github.com/XxHuberrr/Mineradio-paused, revision `d43de565acabfdc1a9c9820a27e81a98ccbebcef`, GPL-3.0-only.

Folia's existing LICENSE and acknowledgements remain. Copied MineRadio modules retain their license and attribution alongside the imported files. Third-party software and assets retain their respective terms. This modified build is not an official release by either upstream author.

Local modifications started 2026-10-26: unified visual/runtime integration, independent application identity, and official Spotify Web API/macOS desktop playback adaptation. See the root design, implementation plan and verification record for the exact local changes.

Selective listening-parity ports on 2026-10-29 also use the downloaded Folia 0.7.23 source: diagnostics, progress/lyric rendering, subtitle layout, lyric cleanup, Tempera and local collection covers. The archive's exact upstream commit was not supplied or verified. Its AGPL-3.0 attribution remains; excluded provider and mpv changes are not part of this port.

## Music-response adaptations, 2026-10-29

- Butterchurn AudioLevels, `src/audio/audioLevels.js`, by Jordan Berg. Source: https://github.com/jberg/butterchurn/blob/master/src/audio/audioLevels.js ; exact source blob `efe4e5527588e8d173e0acebb138ced1f89f6ea2`. Adapted in `src/integrations/mineradio/musicResponse.ts` for elapsed-time, bounded byte-scale band envelopes and explicit silence.
- osu! LogoVisualisation spectrum peak attack/release, by ppy Pty Ltd. Source: https://github.com/ppy/osu/blob/b77b028f9a0256ce23b94ef7eb916648641553e7/osu.Game/Screens/Menu/LogoVisualisation.cs ; source blob `53d153ab31dee7a7a0eecb980f08803d9e2f979a`. Only spectrum envelope math is translated in `src/integrations/mineradio/musicResponse.ts`; no simulated idle beats, branding, artwork, music or beatmaps are copied.
- Interactive Particles Music Visualizer, by Tiago Canzian/Codrops. Source: https://github.com/tgcnzn/Interactive-Particles-Music-Visualizer/blob/main/src/js/entities/glsl/vertex.glsl ; source blob `04b7416a98babbbe3e4a3c1b1060c161017e4617`. The rest/target/distance-weighted deformation pattern is adapted in `public/mineradio/musicSculpture.js`, preserving MineRadio forms, using host-produced spatial regions and capped displacement. The upstream third-party Ashima/curl noise implementation is not copied.

These adaptations are distributed under the following MIT notice:

MIT License

Copyright (c) 2013-2018 Jordan Berg

Copyright (c) 2009 - 2022 Codrops (https://tympanus.net/codrops)

Copyright (c) 2025 ppy Pty Ltd <contact@ppy.sh>.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
