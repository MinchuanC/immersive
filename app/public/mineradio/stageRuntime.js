/* Graphics-only host adapter. Original shaders, camera, shelf and console stay in donor-engine.js. */
var stageLastCover = '', stageCoverToken = 0, stageLastCatalog = '', stageLastLyrics = '', stageLastSettings = '', stageLastAt = 0;
var stageReceivedAt = performance.now(), stageClockAt = 0, stageFirstDrawn = false;
var stageAudioTarget = { bass: 0, mid: 0, treble: 0, energy: 0, beat: 0 };
var stageAudioHeld = { bass: 0, mid: 0, treble: 0, energy: 0, beat: 0 };
var stageRegionTarget = new Float32Array(16), stagePlaybackActivity = 0;
var stageShelfCadence = { elapsed: 0 }, stageViewportRevision = 0, stageWasReduced = false;
var stageStaticSettings = null, stageStaticCatalog = -1, stageStaticCover = -1, stageStaticViewport = -1, stageRenderedPreset = -1;
var stageStaticSkullAsset = null;
var stageLyricRevision = 0, stageStaticLyricCue = '';
var stageDirectionRevision = 0, stageStaticDirection = -1;
var stageRestoringCamera = false;
var stageRenderedLowPower = false, stagePointBudgets = new WeakMap();
function stageBudgetPoints(object, lowPower) {
  if (!object) return;
  var geometry = object.geometry, budget = stagePointBudgets.get(geometry);
  if (lowPower && !budget) {
    var original = geometry.index, count = original ? original.count : geometry.attributes.position.count;
    var indices = [];
    for (var i = 0; i < count; i += 4) indices.push(original ? original.getX(i) : i);
    budget = { original: original, low: new THREE.Uint32BufferAttribute(indices, 1) };
    stagePointBudgets.set(geometry, budget);
  }
  if (!budget) return;
  var index = lowPower ? budget.low : budget.original;
  if (geometry.index !== index) {
    // Release the outgoing GPU index too; the original CPU attributes and geometry stay intact.
    geometry.dispose();
    geometry.setIndex(index);
  }
}
var stageConsoleOpen = false, stageConsoleObserver;
function stageReportConsoleVisibility(open) {
  if (stageConsoleOpen === open) return;
  stageConsoleOpen = open;
  parent.postMessage({ scope: 'immersive-mineradio', session: stageSession, type: open ? 'consoleOpened' : 'consoleClosed' }, '*');
}
fx.aiDepth = false;
fx.cam = 'off';
fx.particleLyrics = false;
fx.shelfPresence = 'auto';
fx.backgroundMedia = { type: 'album' };
fx.backgroundOpacity = .52;

function stageRestoreCamera(state) {
  stageRestoringCamera = true;
  try { return applyCameraArchiveState(state); }
  finally { stageRestoringCamera = false; }
}
function stageApplySettings(settings) {
  if (!settings || typeof settings !== 'object') return;
  var previousPreset = fx.preset;
  if (typeof settings.archivesJson === 'string') { try { userFxArchives = JSON.parse(settings.archivesJson); if (!Array.isArray(userFxArchives)) userFxArchives = []; renderUserFxArchives(); } catch (error) { userFxArchives = []; } }
  Object.keys(settings).forEach(function (key) {
    if (!Object.prototype.hasOwnProperty.call(fxDefaults, key) || isDevelopmentLockedFx(key)) return;
    var value = settings[key];
    if (typeof value !== typeof fxDefaults[key]) return;
    if (typeof value === 'number' && !isFinite(value)) return;
    fx[key] = value;
  });
  var preset = Math.max(0, Math.min(12, Math.round(Number(fx.preset) || 0)));
  fx.preset = previousPreset;
  var savedCamera = null;
  if (typeof settings.cameraStateJson === 'string') { try { savedCamera = JSON.parse(settings.cameraStateJson); } catch (error) {} }
  setPreset(preset, { silent: true, noSave: true, skipTransition: true, preserveCamera: !!(savedCamera && savedCamera.cameraViewSaved) });
  syncFxUniforms();
  if (savedCamera && settings.cameraStateJson !== fx.cameraStateJson) { if (savedCamera.cameraViewSaved) stageRestoreCamera(savedCamera); fx.cameraStateJson = settings.cameraStateJson; }
}
function stageLoadCover(src) {
  var token = ++stageCoverToken;
  var bg = document.getElementById('custom-bg');
  bg.style.backgroundImage = src ? cssImageUrl(src) : '';
  bg.style.opacity = String(fx.backgroundOpacity);
  if (!src) { uniforms.uHasCover.value = 0; return; }
  var img = new Image();
  if (!isInlineCoverSrc(src)) img.crossOrigin = 'anonymous';
  img.onload = function () {
    if (stageDisposed || token !== stageCoverToken) return;
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    var context = canvas.getContext('2d');
    var side = Math.min(img.width, img.height), x = (img.width - side) / 2, y = (img.height - side) / 2;
    context.drawImage(img, x, y, side, side, 0, 0, 512, 512);
    prevCoverTex.image = coverTex.image; prevCoverTex.needsUpdate = true;
    coverTex.image = canvas; coverTex.needsUpdate = true;
    coverPickerCanvas = canvas;
    uniforms.uHasCover.value = 1;
    uniforms.uAlpha.value = 1;
    try {
      coverEdgeTex.image = buildEdgeAndDepth(canvas); coverEdgeTex.needsUpdate = true;
      uniforms.uHasDepth.value = 1;
      updateLyricPaletteFromCover(canvas);
    } catch (error) { console.warn('[MineRadio] Cover pixels unavailable', error); }
    if (stageSnapshot && stageSnapshot.reducedMotion) uniforms.uColorMixT.value = 1;
    else startColorMixTween(700);
    if (shelfManager) shelfManager.onCoverChange(src);
  };
  img.onerror = function () { if (token === stageCoverToken) uniforms.uHasCover.value = 0; };
  img.src = src;
}
window.loadCoverFromUrl = stageLoadCover;
window.applyCoverDataUrl = stageLoadCover;
window.saveFreeCameraState = function () {
  // The donor saves midway through restoration, before the new orbit is assigned.
  if (stageRestoringCamera) return;
  fx.cameraStateJson = JSON.stringify(captureCameraArchiveState());
  stageCommand('settings', { cameraStateJson: fx.cameraStateJson });
};
window.saveUserFxArchives = function () { stageCommand('settings', { archivesJson: JSON.stringify(userFxArchives) }); };
window.readUserFxArchives = function () { return userFxArchives; };
window.applyFxArchiveSnapshot = function (snapshot) { var normalized = normalizeFxArchiveSnapshot(snapshot); if (!normalized) return false; stageApplySettings(normalized); stageRestoreCamera(normalized); saveFreeCameraState(); applySavedLyricPaletteState(); stageSyncInputs(); stageRefreshLyrics(true); saveLyricLayout(); return true; };
window.currentLyricFallbackText = function () { return stageSnapshot && stageSnapshot.metadata && stageSnapshot.metadata.title || ''; };
window.getLyricLineProgress = function (line, next, now) {
  if (!lyricsHasNativeKaraoke || !lyricLineHasNativeKaraoke(line)) return 0;
  var ranges = lyricKaraokeWordRanges(line), progress = 0;
  for (var index = 0; index < line.words.length; index++) {
    var word = line.words[index], range = ranges[index];
    if (now < word.t) return progress;
    if (word.d === 0 || stageSnapshot && stageSnapshot.reducedMotion) { progress = Math.max(progress, range.p1); continue; }
    var local = Math.max(0, Math.min(1, (now - word.t) / word.d));
    progress = Math.max(progress, range.p0 + (range.p1 - range.p0) * local);
    if (local < 1) return progress;
  }
  return progress;
};

function stageRefreshLyrics(force) {
  if (!stageSnapshot || !stageSnapshot.showLyrics) { if (stageLyrics.current) clearStageLyrics(); return; }
  fx.particleLyrics = true;
  lyricsVisible = true;
  if (force) { clearStageLyrics(); createLyricsParticles(); }
  tickLyricsParticles();
  if (stageSnapshot.reducedMotion && stageLyrics.current) {
    stageLyrics.current.userData.age = 10;
    while (stageLyrics.outgoing.length) disposeLyricMesh(stageLyrics.outgoing.pop());
  }
}
function stageTranslateLyrics(lines, hasWordTiming) {
  return lines.map(function (line) {
    var text = String(line.fullText || '');
    var cursor = 0;
    var words = [];
    if (hasWordTiming && line.timingGranularity !== 'line' && Array.isArray(line.words)) line.words.forEach(function (word) {
      var value = String(word.text || ''), start = text.indexOf(value, cursor);
      if (!value || start < 0 || !isFinite(word.startTime) || !isFinite(word.endTime) || word.endTime < word.startTime) return;
      cursor = start + value.length;
      words.push({ text: value, t: word.startTime, d: word.endTime - word.startTime, c0: start, c1: cursor });
    });
    return { text: text, t: line.startTime, duration: Math.max(0, line.endTime - line.startTime), words: words, charCount: words.length ? text.length : 0, translation: line.translation || '' };
  }).filter(function (line) { return line.text && isFinite(line.t); });
}
function stageApplyFrame(snapshot, changes) {
  changes = changes || snapshot;
  if ('locale' in changes || 'consoleCopy' in changes) MineradioConsole.apply(snapshot.locale || 'en', snapshot.consoleCopy);
  var previous = stageSnapshot, receivedAt = performance.now();
  var previousMetadata = previous && previous.metadata || {}, nextMetadata = snapshot.metadata || {};
  var discontinuity = previous && (Math.abs((snapshot.currentTime || 0) - stageClockAt - (previous.paused ? 0 : (receivedAt - stageReceivedAt) / 1000)) > .35 ||
    previousMetadata.trackKey !== nextMetadata.trackKey || previousMetadata.title !== nextMetadata.title || previousMetadata.artist !== nextMetadata.artist || previousMetadata.album !== nextMetadata.album || !!(previous.audio && previous.audio.available) !== !!(snapshot.audio && snapshot.audio.available));
  stageSnapshot = snapshot;
  if (snapshot.renderingSuspended || (previous && previous.renderingSuspended)) {
    MineradioStageMotion.holdRealm(window, !!snapshot.renderingSuspended);
    var heldWorkshop = document.querySelector('#sonic-workshop-layer iframe');
    if (heldWorkshop) MineradioStageMotion.holdRealm(heldWorkshop.contentWindow, !!snapshot.renderingSuspended || !!snapshot.reducedMotion);
  }
  stageReceivedAt = receivedAt;
  stageClockAt = snapshot.currentTime || 0;
  audio.currentTime = stageClockAt; audio.duration = snapshot.duration || 0; audio.paused = !!snapshot.paused; audio.src = snapshot.metadata && snapshot.metadata.title ? 'shared-player' : ''; audio.ended = false;
  playing = !audio.paused;
  var signal = snapshot.audio || {};
  var activeSignal = signal.available && playing;
  var inputEnergy = activeSignal ? signal.energy || 0 : 0;
  stageAudioTarget.bass = activeSignal ? Math.min(.82, (signal.bass || 0) * .78 + inputEnergy * .025) : 0;
  stageAudioTarget.mid = activeSignal ? Math.min(.68, (signal.mid || 0) * .64 + inputEnergy * .025) : 0;
  stageAudioTarget.treble = activeSignal ? Math.min(.56, (signal.treble || 0) * .54) : 0;
  stageAudioTarget.energy = Math.min(.72, inputEnergy);
  stageAudioTarget.beat = activeSignal ? signal.beat || 0 : 0;
  uniforms.uMusicLive.value = activeSignal ? 1 : 0;
  for (var region = 0; region < 16; region++) {
    var level = activeSignal && signal.regions ? signal.regions[region] : 0;
    stageRegionTarget[region] = isFinite(level) ? Math.max(0, Math.min(1, level || 0)) : 0;
  }
  if (!signal.available || discontinuity) {
    Object.keys(stageAudioHeld).forEach(function (key) { stageAudioHeld[key] = 0; });
    smoothBass = smoothMid = smoothTreb = smoothEnergy = beatPulse = audioEnergy = bass = mid = treble = 0;
    uniforms.uMusicRegions.value.fill(0);
  }
  frequencyData = new Uint8Array(signal.available && signal.spectrum || []);
  if ('settings' in changes) {
    var settingsKey = JSON.stringify(snapshot.settings || {});
    if (settingsKey !== stageLastSettings) { stageLastSettings = settingsKey; stageApplySettings(snapshot.settings); stageSyncInputs(); }
  }
  if ('direction' in changes) {
    if (discontinuity || !previous || previous.directionRevision !== snapshot.directionRevision || !!previous.direction !== !!snapshot.direction) stageDirectionRevision++;
    var directed = snapshot.direction;
    ['intensity', 'sonicGroundAmplitude', 'sonicGroundMotionSpeed', 'sonicGroundGlow'].forEach(function (key) {
      var value = directed ? directed[key] : snapshot.settings && snapshot.settings[key];
      if (typeof value !== 'number' || !isFinite(value)) return;
      fx[key] = key === 'intensity' ? Math.max(.1, Math.min(1.5, value)) : Math.max(0, Math.min(100, value));
    });
    uniforms.uIntensity.value = fx.intensity;
  }
  var metadata = snapshot.metadata || {};
  if ('metadata' in changes) {
  document.getElementById('stage-title').textContent = metadata.title || '';
  document.getElementById('stage-artist').textContent = metadata.artist || '';
  document.getElementById('stage-cover').src = metadata.coverUrl || '';
  var controlCover = document.querySelector('#control-cover img'); if (controlCover) controlCover.src = metadata.coverUrl || '';
  var controlTitle = document.getElementById('control-title'); if (controlTitle) controlTitle.textContent = metadata.title || '';
  var controlArtist = document.getElementById('control-artist'); if (controlArtist) controlArtist.textContent = metadata.artist || '';
  if (metadata.coverUrl !== stageLastCover) { stageLastCover = metadata.coverUrl || ''; stageLoadCover(stageLastCover); }
  }
  if ('paused' in changes) {
    var playIcon = document.getElementById('play-icon');
    if (playIcon) playIcon.innerHTML = snapshot.paused ? '<path d="M7 4l13 8-13 8V4z"/>' : '<path d="M7 4v16M17 4v16" stroke-width="4"/>';
  }
  if ('collections' in changes || 'queue' in changes) {
  var catalogKey = JSON.stringify([snapshot.collections, snapshot.queue]);
  if (catalogKey !== stageLastCatalog) {
    stageLastCatalog = catalogKey;
    userPlaylists = (snapshot.collections || []).map(function (item) { return { id: item.id, name: item.name, cover: item.cover, trackCount: item.trackCount, shelfPane: 'mine', provider: 'mineradio' }; });
    playQueue = (snapshot.queue || []).map(function (item) { return { id: item.id, name: item.title, artist: item.artist, cover: item.cover }; });
    playlistCatalogRevision++;
    shelfManager.rebuild();
  }
  }
  if ('metadata' in changes || 'queue' in changes) {
  currentIdx = playQueue.findIndex(function (song) { return song.name === metadata.title && (!metadata.artist || song.artist === metadata.artist); });
  if (currentIdx < 0) { currentIdx = playQueue.length; playlist = new Array(currentIdx + 1); playlist[currentIdx] = { name: metadata.title || '', artist: metadata.artist || '', cover: metadata.coverUrl || '' }; }
  currentLocalSong = playlist[currentIdx] || playQueue[currentIdx] || null;
  }
  if ('metadata' in changes || 'lyrics' in changes || 'wordTiming' in changes || 'showLyrics' in changes) {
  var lyricsKey = JSON.stringify([metadata.title, snapshot.lyrics, snapshot.wordTiming, snapshot.showLyrics]);
  if (lyricsKey !== stageLastLyrics) {
    stageLastLyrics = lyricsKey;
    stageLyricRevision++;
    lyricsHasNativeKaraoke = snapshot.wordTiming === true;
    lyricsLines = stageTranslateLyrics(snapshot.lyrics || [], lyricsHasNativeKaraoke);
    lyricsTranslationLines = [];
    fx.particleLyrics = snapshot.showLyrics === true;
    clearStageLyrics();
  }
  }
  document.body.classList.add('diy-mode');
  document.getElementById('bottom-bar').classList.toggle('visible', snapshot.showControls !== false);
  document.body.classList.toggle('stage-no-controls', snapshot.showControls === false);
  document.body.classList.toggle('stage-reduced-motion', !!snapshot.reducedMotion);
  if ('lyricRenderer' in changes || 'lyricRendererLabel' in changes || 'consoleCopy' in changes) {
    var rendererPicker = document.getElementById('stage-lyric-renderer');
    if (rendererPicker) {
      var rendererLabel = snapshot.consoleCopy && snapshot.consoleCopy.lyrics || snapshot.lyricRendererLabel || 'Lyrics';
      rendererPicker.setAttribute('aria-label', rendererLabel);
      rendererPicker.querySelector('label').textContent = rendererLabel;
      var donorLyrics = snapshot.lyricRenderer === 'mineradio';
      rendererPicker.querySelectorAll('button').forEach(function (button) { button.setAttribute('aria-pressed', String((button.dataset.renderer === 'mineradio') === donorLyrics)); });
      Array.from(rendererPicker.parentElement.children).forEach(function (section) { if (section !== rendererPicker) section.inert = !donorLyrics; });
      document.body.classList.toggle('stage-folia-lyrics', !donorLyrics);
    }
  }
}
function stageSyncInputs() {
  Object.entries(window.stageRangeKeys || {}).forEach(function (pair) { var el = document.getElementById(pair[0]); if (el && fx[pair[1]] != null) setRange(pair[0], fx[pair[1]]); });
  document.querySelectorAll('[onclick*="toggleFx("]').forEach(function (el) { var key = /toggleFx\(['"]([^'"]+)/.exec(el.getAttribute('onclick')); if (key) el.classList.toggle('on', !!fx[key[1]]); });
  updateLyricDisplayModeControls(); updateLyricTranslationModeControls(); updateLyricMotionStyleControls();
  stageSyncToggleStates();
}
function stageSyncToggleStates() {
  document.querySelectorAll('.fx-toggle').forEach(function (el) {
    el.setAttribute('role', 'switch');
    el.setAttribute('aria-checked', String(el.classList.contains('on')));
    el.tabIndex = el.getAttribute('aria-disabled') === 'true' ? -1 : 0;
  });
}
function stageBindControls() {
  var panel = document.getElementById('fx-panel');
  var close = document.createElement('button');
  close.id = 'stage-console-close'; close.type = 'button'; close.className = 'fx-mini-btn ghost';
  close.textContent = '×'; close.setAttribute('aria-label', 'Close visual console'); close.dataset.stageClose = '';
  close.addEventListener('click', function () { toggleFxPanel(false); });
  panel.querySelector('.fx-head').appendChild(close);
  stageConsoleObserver = new MutationObserver(function () { stageReportConsoleVisibility(panel.classList.contains('show') || panel.classList.contains('peek')); });
  stageConsoleObserver.observe(panel, { attributes: true, attributeFilter: ['class'] });
  var lyricPage = document.querySelector('[data-fx-page="lyrics"]');
  if (lyricPage) {
    var picker = document.createElement('div');
    picker.id = 'stage-lyric-renderer'; picker.className = 'fx-section'; picker.setAttribute('role', 'group');
    picker.innerHTML = '<label></label><div class="fx-seg"><button type="button" data-renderer="folia">Folia</button><button type="button" data-renderer="mineradio">MineRadio</button></div>';
    picker.querySelectorAll('button').forEach(function (button) { button.addEventListener('click', function () { stageCommand('lyricsMode', button.dataset.renderer); }); });
    lyricPage.prepend(picker);
  }
  var supported = {
    togglePlay: function () { stageCommand('playPause'); }, prevTrack: function () { stageCommand('previous'); }, nextTrack: function () { stageCommand('next'); },
    toggleFullscreen: function () { stageCommand('fullscreen'); }, toggleLyricsPanel: function () { stageCommand('openSettings'); },
    toggleLikeCurrent: function () { stageCommand('openLibrary'); }, toggleMiniQueue: function () { stageCommand('openQueue'); },
    toggleUploadPanel: function () { stageCommand('openFiles'); }, toggleHome: function () { stageCommand('openHome'); },
    toggleFxFabAutoHide: function () { fxFabAutoHide = !fxFabAutoHide; }, toggleControlsAutoHide: function () { controlsAutoHide = !controlsAutoHide; saveBooleanPreference('controlsAutoHide', controlsAutoHide); },
    setLyricDisplayMode: function (value) { fx.lyricDisplayMode = normalizeLyricDisplayMode(value); updateLyricDisplayModeControls(); stageRefreshLyrics(true); saveLyricLayout(); },
    setLyricTranslationMode: function (value) { fx.lyricTranslationMode = normalizeLyricTranslationMode(value); updateLyricTranslationModeControls(); stageRefreshLyrics(true); saveLyricLayout(); },
    setLyricMotionStyle: function (value) { fx.lyricMotionStyle = normalizeLyricMotionStyle(value); updateLyricMotionStyleControls(); stageRefreshLyrics(true); saveLyricLayout(); },
  };
  Object.assign(window, supported);
  buildLyricColorControls();
  renderUserFxArchives();
  document.querySelectorAll('input[type=color]').forEach(function (el) { var keys = { 'ui-accent-picker': 'uiAccentColor', 'visual-tint-picker': 'visualTintColor', 'lyric-color-picker': 'lyricColor', 'lyric-highlight-picker': 'lyricHighlightColor', 'lyric-glow-picker': 'lyricGlowColor', 'shelf-accent-picker': 'shelfAccentColor' }; var key = keys[el.id]; if (!key) return; el.addEventListener('input', function () { fx[key] = el.value; if (key === 'lyricColor') fx.lyricColorMode = 'custom'; if (key === 'lyricHighlightColor') fx.lyricHighlightMode = 'custom'; if (key === 'visualTintColor') fx.visualTintMode = 'custom'; syncFxUniforms(); applySavedLyricPaletteState(); stageRefreshLyrics(true); saveLyricLayout(); }); });
  document.querySelectorAll('[onclick]').forEach(function (el) {
    var handler = el.getAttribute('onclick'), name = /^\s*([a-zA-Z_$][\w$]*)\(/.exec(handler);
    var locked = /(?:desktop|wallpaper|memory|startup|close-behavior|audio-output|gesture|aidepth|hotkey|cache|font-upload)/i.test(el.id || '');
    if (name && (typeof window[name[1]] !== 'function' || locked)) {
      el.removeAttribute('onclick'); el.setAttribute('aria-disabled', 'true'); el.classList.add('stage-unavailable'); el.dataset.stageUnavailable = 'unavailable';
      if (el.tagName === 'BUTTON' || el.tagName === 'INPUT') el.disabled = true;
    }
  });
  document.getElementById('fx-fab').addEventListener('click', function () { toggleFxPanel(); });
  document.getElementById('fx-panel').addEventListener('pointerleave', function () { if (!fxPanelPinned) setPeek('fx', false); });
  document.getElementById('fx-panel').addEventListener('click', stageSyncToggleStates);
  document.getElementById('fx-panel').addEventListener('keydown', function (event) {
    var toggle = event.target.closest('.fx-toggle');
    if (!toggle || toggle.getAttribute('aria-disabled') === 'true' || event.repeat || !/^(Space|Enter)$/.test(event.code)) return;
    event.preventDefault(); event.stopPropagation(); toggle.click();
  });
  document.getElementById('progress-bar').addEventListener('click', function (event) { var box = this.getBoundingClientRect(); if (audio.duration > 0) stageCommand('seek', Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)) * audio.duration); });
  var volume = document.getElementById('volume-slider');
  if (volume) volume.addEventListener('input', function () { stageCommand('volume', Number(this.value)); });
  Object.entries(window.stageRangeKeys || {}).forEach(function (pair) {
    var el = document.getElementById(pair[0]), key = pair[1];
    if (!el || !(key in fxDefaults)) return;
    if (isDevelopmentLockedFx(key) || /^(desktop|wallpaper|memory)/i.test(key)) { el.disabled = true; el.dataset.stageUnavailable = 'unavailable'; return; }
    el.addEventListener('input', function () {
      fx[key] = Math.max(Number(el.min || -Infinity), Math.min(Number(el.max || Infinity), Number(el.value)));
      if (key === 'coverResolution') applyCoverParticleResolution(fx[key]);
      syncFxUniforms(); setRange(pair[0], fx[key]);
      if (/^lyric/.test(key)) stageRefreshLyrics(true);
      if (/^shelf/.test(key)) shelfManager.rebuild();
      if (/^background/.test(key)) document.getElementById('custom-bg').style.opacity = String(fx.backgroundOpacity);
    });
    el.addEventListener('change', function () { saveLyricLayout(); });
  });
  var originalOpen = shelfManager.openContent;
  shelfManager.openContent = function (index) {
    var cards = shelfManager.getCards(), card = cards.find(function (item) { return item.index === index; });
    var id = card && card.item && String(card.item.playlistId || '').replace(/^mineradio:/, '');
    var collection = stageSnapshot && (stageSnapshot.collections || []).find(function (item) { return String(item.id) === id; });
    if (card && card.item && card.item.type === 'playlist' && !(collection && collection.tracks)) stageCommand('selectCollection', id);
    else originalOpen(index);
  };
  MineradioConsole.bindCapabilities(stageCommand, window.stageRangeKeys || {});
  stageSyncInputs();
}
window.addEventListener('keydown', function (event) {
  if (event.repeat) return;
  var code = event.code;
  var panel = document.getElementById('fx-panel');
  if (code === 'Escape' && panel && (panel.classList.contains('show') || panel.classList.contains('peek'))) {
    event.preventDefault(); event.stopImmediatePropagation(); toggleFxPanel(false);
    return;
  }
  if (event.target.closest && event.target.closest('input,textarea,select,button,[contenteditable="true"],[role="slider"],#fx-panel')) return;
  if (code === 'Space' && freeCamera && freeCamera.active) return;
  if (!/^(Space|ArrowLeft|ArrowRight|Escape|KeyH|KeyP)$/.test(code) && !(code === 'KeyK' && (event.metaKey || event.ctrlKey))) return;
  event.preventDefault(); event.stopImmediatePropagation();
  parent.postMessage({ scope: 'immersive-mineradio', session: stageSession, type: 'shortcut', code: code, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey, shiftKey: event.shiftKey }, '*');
}, true);
function stageDraw(now) {
  if (stageDisposed) return;
  stageAnimation = requestAnimationFrame(stageDraw);
  if (document.hidden || !stageSnapshot || stageSnapshot.renderingSuspended) return;
  var reduced = stageSnapshot.reducedMotion;
  var dt = Math.min(.05, Math.max(.001, (now - (stageLastAt || now - 16)) / 1000)); stageLastAt = now;
  audio.currentTime = Math.min(audio.duration || Infinity, stageClockAt + (playing ? Math.min(.5, (now - stageReceivedAt) / 1000) : 0));
  var workshop = document.querySelector('#sonic-workshop-layer iframe');
  if (workshop && workshop.contentDocument && workshop.contentDocument.querySelector('canvas')) MineradioStageMotion.holdRealm(workshop.contentWindow, !!reduced);
  var compositionChanged = stageRenderedLowPower !== !!stageSnapshot.lowPowerMode || !stageFirstDrawn || stageStaticSettings !== stageLastSettings || stageStaticCatalog !== playlistCatalogRevision || stageStaticCover !== coverTex.version || stageStaticViewport !== stageViewportRevision || stageStaticSkullAsset !== skullParticleAsset.data || stageStaticDirection !== stageDirectionRevision;
  var staticChanged = !stageWasReduced || compositionChanged;
  var lyricCue = '';
  if (reduced) {
    var lyricNow = getAdjustedLyricPlaybackTime(audio.currentTime);
    var lyricIndex = stageSnapshot.showLyrics ? findStageLyricIndexAtTime(lyricNow) : -1;
    var lyricLine = lyricsLines[lyricIndex];
    var activeWords = lyricLine ? lyricLine.words.filter(function (word) { return word.t <= lyricNow; }).length : 0;
    lyricCue = stageLyricRevision + ':' + lyricIndex + ':' + activeWords;
    var pendingLyric = stageSnapshot.showLyrics && lyricsLines.length && (!stageLyrics.current || stageLyrics.currentIdx !== (lyricIndex < 0 ? -2 : lyricIndex));
    if (!staticChanged && lyricCue === stageStaticLyricCue && !pendingLyric) return;
  }
  if (!reduced) {
    stagePlaybackActivity += ((playing ? 1 : 0) - stagePlaybackActivity) * (1 - Math.exp(-dt / .14));
    uniforms.uAmbientActivity.value = stageSnapshot.audio && stageSnapshot.audio.available ? 0 : stagePlaybackActivity;
    MineradioStageMotion.audio(stageAudioHeld, stageAudioTarget, dt);
    smoothBass = stageAudioHeld.bass; smoothMid = stageAudioHeld.mid; smoothTreb = stageAudioHeld.treble; smoothEnergy = stageAudioHeld.energy; beatPulse = stageAudioHeld.beat;
    audioEnergy = Math.max(smoothEnergy, beatPulse * .30);
    bass = Math.min(.90, smoothBass * 1.05 + beatPulse * .18) * fx.intensity;
    mid = Math.min(.72, smoothMid * 1.12) * fx.intensity;
    treble = Math.min(.62, smoothTreb * 1.20) * fx.intensity;
    for (var region = 0; region < 16; region++) {
      var heldRegion = uniforms.uMusicRegions.value[region], targetRegion = stageRegionTarget[region];
      uniforms.uMusicRegions.value[region] += (targetRegion - heldRegion) * MineradioStageMotion.ease(targetRegion > heldRegion ? .55 : .18, dt);
    }
    var motionRate = .06 + stagePlaybackActivity * .94;
    uniforms.uTime.value += dt * motionRate;
    uniforms.uVinylSpin.value = (uniforms.uVinylSpin.value + dt * motionRate * (.40 + smoothBass * .09) * Math.max(.05, Number(fx.speed) || 1)) % (Math.PI * 2);
    updateParticlePointerFrame();
  }
  uniforms.uAlpha.value = 1;
  uniforms.uBass.value = bass; uniforms.uMid.value = mid; uniforms.uTreble.value = treble; uniforms.uBeat.value = beatPulse; uniforms.uEnergy.value = audioEnergy;
  uniforms.uMouseXY.value.set(mouseWorld.x, mouseWorld.y); uniforms.uMouseActive.value = mouseActive ? 1 : 0;
  if (!reduced) {
    uniforms.uBurstAmt.value *= 1 - MineradioStageMotion.ease(.10, dt);
    tickPresetTransition(); updateRipples(dt); updateFloatLayer(dt); updateBackgroundStarRiverState(dt, false);
    var shelfDt = MineradioStageMotion.cadence(stageShelfCadence, dt, 30);
    if (shelfDt) shelfManager.update(shelfDt);
    stageRefreshLyrics(false);
    updateCinema(dt); updateFreeCamera(dt); updateCamera(dt); applySkullCameraPose(dt);
    if (!particlePointerSpin.active) MineradioStageMotion.inertia(gestureRotation, particleSpin, dt);
    var rotationEase = MineradioStageMotion.ease(.055, dt);
    particles.rotation.x += (gestureRotation.x - particles.rotation.x) * rotationEase;
    particles.rotation.y += (gestureRotation.y - particles.rotation.y) * rotationEase;
    updateSkullParticleLayer(dt);
  } else {
    if (stageRenderedPreset !== fx.preset) {
      applyPresetOrbitBaseline(fx.preset, { syncCurrent: true });
      orbit.cineTheta = orbit.cinePhi = orbit.cineRadius = 0;
      updateCamera(0);
    }
    // Settle a newly composed static shelf in one draw; subsequent clock packets cannot move it.
    if (compositionChanged) {
      for (var settle = 0; settle < 30; settle++) shelfManager.update(1 / 30);
      updateSkullParticleLayer(1);
    }
  }
  var skull = fx.preset === 6, workshopPreset = fx.preset === 8;
  particles.visible = !skull && !workshopPreset && fx.preset !== 3;
  var lowPower = stageSnapshot.lowPowerMode === true;
  stageBudgetPoints(particles, lowPower);
  stageBudgetPoints(floatGroup, lowPower);
  stageBudgetPoints(skullParticleGroup, lowPower);
  bloomParticles.visible = !lowPower && particles.visible && fx.bloom && fx.bloomStrength > .01;
  bloomParticles.rotation.copy(particles.rotation);
  var frame = { scene: scene, fx: fx, time: uniforms.uTime.value, screenHeight: innerHeight, dpr: renderer.getPixelRatio(), visualRotation: particles.rotation, visualRotationActive: orbit.rotating, audio: { bass: bass, mid: mid, treble: treble, beat: beatPulse, energy: audioEnergy } };
  if (stageSnapshot.direction) frame.scoreTime = audio.currentTime;
  var visualDt = reduced ? (stageRenderedPreset !== fx.preset ? 1 : 0) : dt;
  MineradioSonicTopography.update(visualDt, frame); MineradioSonicWorkshop.update(visualDt, frame);
  stageStaticDirection = stageDirectionRevision;
  if (reduced && workshop && workshop.contentDocument && workshop.contentDocument.querySelector('canvas')) {
    MineradioSonicWorkshop.pushProperties(true);
    MineradioStageMotion.stepRealm(workshop.contentWindow);
  }
  if (fx.particleLyrics) { if (reduced) stageRefreshLyrics(false); updateStageLyrics3D(reduced ? 0 : dt); }
  renderer.render(scene, camera);
  stageWasReduced = !!reduced;
  stageRenderedLowPower = lowPower;
  stageStaticLyricCue = lyricCue;
  stageStaticSettings = stageLastSettings; stageStaticCatalog = playlistCatalogRevision; stageStaticCover = coverTex.version; stageStaticViewport = stageViewportRevision; stageRenderedPreset = fx.preset; stageStaticSkullAsset = skullParticleAsset.data;
  if (!stageFirstDrawn) { stageFirstDrawn = true; parent.postMessage({ scope: 'immersive-mineradio', session: stageSession, type: 'drawn' }, '*'); }
  if (stageSnapshot.showControls === false) return;
  var progress = audio.duration ? audio.currentTime / audio.duration * 100 : 0;
  document.getElementById('progress-fill').style.width = progress + '%';
  document.getElementById('progress-thumb').style.left = progress + '%';
  function time(value) { return Math.floor(value / 60) + ':' + String(Math.floor(value % 60)).padStart(2, '0'); }
  document.getElementById('time-display').textContent = time(audio.currentTime) + ' / ' + time(audio.duration);
}
function stageDispose() {
  if (stageDisposed) return;
  if (stageConsoleObserver) stageConsoleObserver.disconnect();
  stageReportConsoleVisibility(false);
  stageDisposed = true; stageCoverToken++;
  MineradioConsole.dispose();
  cancelAnimationFrame(stageAnimation);
  stageTimers.forEach(clearTimeout); stageTimers.clear(); stageIntervals.forEach(clearInterval); stageIntervals.clear();
  stageRafs.forEach(cancelAnimationFrame); stageRafs.clear();
  stageListeners.forEach(function (entry) { stageNativeRemoveListener.call(entry[0], entry[1], entry[2], entry[3]); }); stageListeners.length = 0;
  if (window.gsap) { gsap.globalTimeline.clear(); gsap.ticker.sleep(); }
  try { MineradioSonicTopography.clear(); MineradioSonicWorkshop.clear(); } catch (error) { console.warn('[MineRadio] Preset cleanup', error); }
  try { clearStageLyrics(); flushLyricDisposeQueue(); } catch (error) { console.warn('[MineRadio] Lyrics cleanup', error); }
  var resources = new Set();
  scene.traverse(function (object) {
    if (object.geometry) resources.add(object.geometry);
    (Array.isArray(object.material) ? object.material : object.material ? [object.material] : []).forEach(function (material) {
      resources.add(material);
      Object.values(material).forEach(function (value) { if (value && value.isTexture) resources.add(value); });
      if (material.uniforms) Object.values(material.uniforms).forEach(function (uniform) { if (uniform.value && uniform.value.isTexture) resources.add(uniform.value); });
    });
  });
  resources.forEach(function (resource) { resource.dispose(); });
  scene.clear(); renderer.dispose(); renderer.forceContextLoss();
  if (window.__immersiveMotionHold) window.__immersiveMotionHold.held.clear();
  window.removeEventListener('message', stageReceive);
  window.removeEventListener('resize', stageResize);
}
function stageReceive(event) {
  var message = event.data;
  if (event.source !== parent || !message || message.scope !== 'immersive-mineradio' || message.session !== stageSession) return;
  if (message.type === 'dispose') stageDispose();
  else if (message.type === 'openConsole' && !stageDisposed) { toggleFxPanel(true); fxPanelPinned = true; document.getElementById('fx-console-tab-home').focus(); }
  else if (message.type === 'frame' && message.payload && !stageDisposed) stageApplyFrame(Object.assign({}, stageSnapshot || {}, message.payload), message.payload);
}
window.addEventListener('message', stageReceive);
window.addEventListener('resize', stageResize);
window.addEventListener('pagehide', stageDispose, { once: true });
shelfManager.setMode('side');
buildPresetGrid();
relabelFxPanelControls();
organizeFxPanel();
stageBindControls();
syncFxUniforms();
setPreset(0, { noSave: true, silent: true, skipTransition: true });
stageAnimation = requestAnimationFrame(stageDraw);
window.__immersiveStage = { dispose: stageDispose, applyFrame: stageApplyFrame, presetCount: presetMeta.length };
