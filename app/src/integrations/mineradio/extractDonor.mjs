import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Reproducible extraction of the pinned donor's graphics, with no application bootstrap.
const donor = fileURLToPath(new URL('../../../../.references/mineradio/', import.meta.url));
const output = fileURLToPath(new URL('../../../public/mineradio/', import.meta.url));
// Update integration script loading without overwriting the adapted shaders and presets.
if (process.argv.includes('--console-shell')) {
    const shellPath = path.join(output, 'stage.html');
    const shell = fs.readFileSync(shellPath, 'utf8').replace(/<script src="(?:musicSculpture|stageConsole)\.js"><\/script>/g, '').replace('<script src="stageRuntime.js">', '<script src="musicSculpture.js"></script><script src="stageConsole.js"></script><script src="stageRuntime.js">');
    fs.writeFileSync(shellPath, shell);
    process.exit(0);
}
const modules = path.join(donor, 'public/js/modules');
fs.mkdirSync(output, { recursive: true });
const copy = (from, to = from) => { fs.mkdirSync(path.dirname(path.join(output, to)), { recursive: true }); fs.cpSync(path.join(donor, from), path.join(output, to), { recursive: true }); };
copy('LICENSE', 'LICENSE');
const defaultsSource = fs.readFileSync(path.join(modules, '00-state/04-fx-defaults.js'), 'utf8');
const defaults = Function(defaultsSource + ';return fxDefaults;')();
const primitiveDefaults = Object.fromEntries(Object.entries(defaults).filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value)));
primitiveDefaults.preset = 12;
primitiveDefaults.archivesJson = '[]';
primitiveDefaults.cameraStateJson = '{}';
primitiveDefaults.backgroundOpacity = 0.52;
primitiveDefaults.aiDepth = false;
fs.writeFileSync(fileURLToPath(new URL('./donorDefaults.ts', import.meta.url)), '// Generated from pinned MineRadio fxDefaults by extractDonor.mjs.\nexport const MINERADIO_DEFAULT_SETTINGS: Record<string, string | number | boolean> = ' + JSON.stringify(primitiveDefaults, null, 4) + ';\n');
copy('public/css/index.css', 'donor.css');
copy('public/vendor/three.r128.min.js', 'vendor/three.r128.min.js');
copy('public/vendor/gsap.min.js', 'vendor/gsap.min.js');
copy('public/vendor/sonic-workshop', 'vendor/sonic-workshop');
copy('public/sonic-topography-preset.js', 'sonic-topography-preset.js');
copy('public/sonic-workshop-preset.js', 'sonic-workshop-preset.js');
copy('public/assets/skull-decimation-points.bin', 'assets/skull-decimation-points.bin');
const sources = [];
function add(name, transform = text => text) {
    const raw = fs.readFileSync(path.join(modules, name), 'utf8');
    const text = transform(raw);
    sources.push(`\n// ---- MineRadio ${name} (GPL-3.0, pinned d43de565) ----\n${text}`);
}
add('00-state/04-fx-defaults.js');
sources.push('\nvar fx = Object.assign({}, fxDefaults);\n');
add('00-state/03-beat-dj-state.js');
add('01-scene/00-renderer-quality.js');
add('01-scene/01-orbit-free-camera.js');
add('01-scene/02-beat-camera-runtime.js');
add('01-scene/03-focus-cinema-camera.js', text => text
    .replace('function updateCamera() {', 'function updateCamera(dt) {')
    .replace('    orbit.userTheta += recenterThetaDelta * recenterEase;', '    recenterEase = MineradioStageMotion.ease(recenterEase, dt);\n    orbit.userTheta += recenterThetaDelta * recenterEase;')
    .replace('  orbit.theta += (targetTheta - orbit.theta) * focusEase;', '  focusEase = MineradioStageMotion.ease(focusEase, dt);\n  radiusEase = MineradioStageMotion.ease(radiusEase, dt);\n  orbit.theta += (targetTheta - orbit.theta) * focusEase;')
    .replace('  camera.fov += (targetFOV - camera.fov) * fovEase;', '  camera.fov += (targetFOV - camera.fov) * MineradioStageMotion.ease(fovEase, dt);')
    .replace('  camPunch *= 0.86;', '  camPunch *= 1 - MineradioStageMotion.ease(0.14, dt);')
    .replace('    orbit.cineTheta *= 0.95;', '    orbit.cineTheta *= 1 - MineradioStageMotion.ease(0.05, dt);')
    .replace('    orbit.cinePhi *= 0.95;', '    orbit.cinePhi *= 1 - MineradioStageMotion.ease(0.05, dt);')
    .replace('    orbit.cineRadius *= 0.95;', '    orbit.cineRadius *= 1 - MineradioStageMotion.ease(0.05, dt);'));
add('01-scene/04-bottom-controls-cursor.js');
for (const file of fs.readdirSync(path.join(modules, '02-visual')).filter(file => file.endsWith('.js')).sort()) {
    if (file === '04-visual-settings-persistence.js') add(`02-visual/${file}`, text => text.slice(0, text.indexOf('function plainCurrentFxAutosavePayload(')) + '\n' + text.slice(text.indexOf('function normalizeHexColor(')));
    else add(`02-visual/${file}`);
}
for (const file of fs.readdirSync(path.join(modules, '04-shelf')).filter(file => file.endsWith('.js')).sort()) add(`04-shelf/${file}`);
add('05-playback/06-track-detail-lyrics-actions.js', text => text.slice(text.indexOf('function updateLyricDisplayModeControls()'), text.indexOf('function refreshStageLyricDisplayMode()')));
add('07-fx/00-preset-archive-data.js', text => text.replace('var hadStoredUserFxArchives = hasStoredUserFxArchives();', 'var hadStoredUserFxArchives = true;').replace('var userFxArchives = readUserFxArchives();', 'var userFxArchives = [];'));
for (const file of ['01-lyric-color-controls.js','02-accent-background-controls.js','03-cover-picker-fonts.js','04-preset-grid-uniforms.js','05-fx-panel-performance.js','07-bindings-shelf-immersive.js','09-console-workspace.js']) add(`07-fx/${file}`);
const bindings = fs.readFileSync(path.join(modules, '07-fx/07-bindings-shelf-immersive.js'), 'utf8');
const ranges = Object.fromEntries([...bindings.matchAll(/\['(fx-[^']+)', '([^']+)'\]/g)].map(match => [match[1], match[2]]));
sources.push('\nwindow.stageRangeKeys = ' + JSON.stringify(ranges) + ';\n');
fs.writeFileSync(path.join(output, 'donor-engine.js'), sources.join('\n'));
const html = fs.readFileSync(path.join(donor, 'public/index.html'), 'utf8');
function element(id) {
    const marker = html.indexOf(`id="${id}"`);
    if (marker < 0) throw new Error(`Donor element missing: ${id}`);
    const start = html.lastIndexOf('<', marker);
    const tags = /<\/?([a-z][\w-]*)\b[^>]*>/gi;
    tags.lastIndex = start;
    let depth = 0;
    for (let tag; (tag = tags.exec(html));) {
        const value = tag[0];
        if (/^<\//.test(value)) depth--;
        else if (!/\/$/.test(value.slice(0, -1)) && !/^(input|img|br|hr|meta|link|source|wbr|area|base|embed|param)$/i.test(tag[1])) depth++;
        if (depth === 0) return html.slice(start, tags.lastIndex);
    }
    throw new Error(`Unclosed donor element: ${id}`);
}
const fragments = ['custom-bg','canvas-container','fx-fab','fx-fab-hide-btn','fx-panel','bottom-handle','bottom-bar'].map(element).join('\n');
const stage = `<!doctype html>\n<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="donor.css"><link rel="stylesheet" href="stage.css"><title>Immersive visual stage</title></head><body class="immersive-stage">${fragments}<div id="toast" role="status"></div><div id="stage-track" aria-live="polite"><img id="stage-cover" alt=""><div><strong id="stage-title"></strong><span id="stage-artist"></span></div></div><script src="vendor/three.r128.min.js"></script><script src="vendor/gsap.min.js"></script><script src="stageMotion.js"></script><script src="stagePrelude.js"></script><script src="sonic-topography-preset.js"></script><script src="sonic-workshop-preset.js"></script><script src="donor-engine.js"></script><script src="musicSculpture.js"></script><script src="stageConsole.js"></script><script src="stageRuntime.js"></script></body></html>\n`;
fs.writeFileSync(path.join(output, 'stage.html'), stage);
fs.writeFileSync(path.join(output, 'NOTICE.md'), `# MineRadio visual integration\n\nSource: https://github.com/XxHuberrr/Mineradio-paused at d43de565acabfdc1a9c9820a27e81a98ccbebcef.\n\nThe particle geometry, 13 presets, shader source, camera, 3D collection shelf, lyrics graphics, visual console, and dock are extracted directly from the GPL-3.0 donor. See LICENSE. Original source file boundaries remain in donor-engine.js. The extraction intentionally excludes the original application bootstrap, playback engine, accounts, provider transports, and home/navigation runtime. Folia owns these capabilities and sends validated state through stageBridge.ts.\n\nRegenerate donor assets from the frozen checkout with node src/integrations/mineradio/extractDonor.mjs. stagePrelude.js, stageRuntime.js and stage.css are the integration boundary. Sonic Workshop retains its upstream graphics-only iframe.\n`);
console.log(`Extracted ${sources.length} source fragments (${Math.round(sources.join('').length / 1024)} KiB).`);

if (process.argv.includes('--stage-only')) process.exit(0);

// The home and dock keep donor selectors, scoped into the shared React document.
const { default: postcss } = await import('postcss');
const donorCss = fs.readFileSync(path.join(donor, 'public/css/index.css'), 'utf8');
function scopedCss(scope, pattern) {
    const parsed = postcss.parse(donorCss);
    const result = postcss.root();
    const variables = postcss.rule({ selector: scope });
    parsed.walkRules(rule => { if (rule.selector === ':root') rule.walkDecls(declaration => { if (declaration.prop.startsWith('--')) variables.append(declaration.clone()); }); });
    result.append(variables);
    function visit(nodes, parent) {
        for (const node of nodes) {
            if (node.type === 'rule') {
                const selectors = node.selectors.filter(selector => pattern.test(selector));
                if (!selectors.length) continue;
                const clone = node.clone();
                clone.selectors = selectors.map(selector => /^(body|html)\b/.test(selector) ? selector.replace(/^(body|html)\b/, scope) : `${scope} ${selector}`);
                parent.append(clone);
            } else if (node.type === 'atrule' && /keyframes$/i.test(node.name)) parent.append(node.clone());
            else if (node.type === 'atrule' && node.nodes) { const clone = node.clone({ nodes: [] }); visit(node.nodes, clone); if (clone.nodes.length) parent.append(clone); }
        }
    }
    visit(parsed.nodes, result);
    const names = new Map();
    result.walkAtRules(/keyframes$/i, rule => { const previous = rule.params; rule.params = `${scope.slice(1)}-${previous}`; names.set(previous, rule.params); });
    result.walkDecls(/animation/, declaration => { for (const [from, to] of names) declaration.value = declaration.value.replace(new RegExp(`\\b${from}\\b`, 'g'), to); });
    return '/* GPL-3.0: scoped directly from MineRadio d43de565 public/css/index.css. Regenerate with extractDonor.mjs. */\n' + result.toString();
}
fs.writeFileSync(fileURLToPath(new URL('./MineradioHome.donor.css', import.meta.url)), scopedCss('.mineradio-home', /(?:#empty-home|\.empty-home|\.home-|#home-|\.daily-review|#daily-review)/));
fs.writeFileSync(fileURLToPath(new URL('./MineradioDock.donor.css', import.meta.url)), scopedCss('.mineradio-dock', /(?:#bottom-bar|#controls\b|\.control-|\.ctrl-btn|#play-btn|#progress-|#time-display|#volume-|\.volume-|#prev-btn|#next-btn|#mini-queue)/));
