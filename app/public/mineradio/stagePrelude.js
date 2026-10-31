/* Immersive adapter state. No media element, AudioContext, provider or account runtime. */
var stageSession = new URLSearchParams(location.search).get('session') || '';
var stageDisposed = false, stageSnapshot = null, stageAnimation = 0;
var stageTimers = new Set(), stageIntervals = new Set(), stageRafs = new Set();
var stageListeners = [];
var stageNativeAddListener = EventTarget.prototype.addEventListener, stageNativeRemoveListener = EventTarget.prototype.removeEventListener;
EventTarget.prototype.addEventListener = function (type, callback, options) { stageListeners.push([this, type, callback, options]); return stageNativeAddListener.call(this, type, callback, options); };
var stageNativeRaf = window.requestAnimationFrame.bind(window);
window.requestAnimationFrame = function (fn) { if (stageDisposed) return 0; var id = stageNativeRaf(function (now) { stageRafs.delete(id); if (!stageDisposed) fn(now); }); stageRafs.add(id); return id; };
var stageNativeTimeout = window.setTimeout.bind(window), stageNativeInterval = window.setInterval.bind(window);
window.setTimeout = function (fn, delay) { if (stageDisposed) return 0; var args = Array.prototype.slice.call(arguments, 2); var id = stageNativeTimeout(function () { stageTimers.delete(id); if (!stageDisposed) fn.apply(null, args); }, delay); stageTimers.add(id); return id; };
window.setInterval = function (fn, delay) { if (stageDisposed) return 0; var id = stageNativeInterval(function () { if (!stageDisposed) fn(); }, delay); stageIntervals.add(id); return id; };
function stageCommand(action, value) { if (!stageDisposed) parent.postMessage({ scope: 'immersive-mineradio', session: stageSession, type: 'command', action: action, value: value }, '*'); }
var audio = { currentTime: 0, duration: 0, paused: true }, audioCtx = null, analyser = null, beatAnalyser = null;
var frequencyData = new Uint8Array(0), beatFrequencyData = new Uint8Array(0), beatTimeDomainData = new Uint8Array(0);
var bass = 0, mid = 0, treble = 0, audioEnergy = 0, beatPulse = 0, prevEnergy = 0;
var smoothBass = 0, smoothMid = 0, smoothTreb = 0, smoothEnergy = 0;
var bassPeak = .12, midPeak = .10, treblePeak = .08, energyPeak = .10, beatOnsetFlag = false;
var lyricSunEnergy = 0, scheduledBeatFlag = false, scheduledBeatPulse = 0;
var lyricsLines = [], lyricsTranslationLines = [], lyricsVisible = false, lyricsHasNativeKaraoke = false;
var playlist = [], playQueue = [], userPlaylists = [], myPodcastCollections = [], currentIdx = -1, playing = false;
var playlistCatalogRevision = 0, playlistCoverCache = Object.create(null), currentLocalSong = null;
var trackSwitchToken = 0, currentLyricFallbackText = '', pendingPlaybackResumeAt = 0, restoredLastPlaybackSnapshot = null;
var coverDepthCache = Object.create(null), coverDepthCacheKeys = [], coverProcessToken = 0;
var aiDepthPipeline = null, aiDepthReady = false, aiDepthBusy = false, aiDepthFailUntil = 0, aiDepthLastRunAt = 0, aiDepthMinGapMs = 18000;
var customLyricFonts = [], customLyricFontReadyPromise = Promise.resolve();
var albumBackgroundCurrentSrc = '', backgroundCacheTrimTimer = 0;
var SONIC_PRESET_INDEX = 7, SONIC_WORKSHOP_PRESET_INDEX = 8, VISUAL_PRESET_SCHEMA = 2;
var FREE_CAMERA_STORE_KEY = 'immersive-mineradio-camera', CUSTOM_LYRIC_FONT_STORE_KEY = 'immersive-mineradio-fonts', CUSTOM_LYRIC_FONT_MAX_COUNT = 8, CUSTOM_LYRIC_FONT_MAX_BYTES = 10485760;
var CONTROLS_AUTO_HIDE_STORE_KEY = 'controlsAutoHide', CURSOR_HIDE_DELAY = 2500, PEEK_HIDE_DELAY = 170, PLAYLIST_LAZY_BATCH_SIZE = 48;
var controlsAutoHide = false, controlsHovering = false, controlsHideTimer = null, controlsRevealHoldUntil = 0, controlsHandleDimTimer = null, controlsLastMoveAt = 0, controlsShelfSuppressUntil = 0, cursorHideTimer = null;
var fxPanelPinned = false, fxFabAutoHide = false, miniQueueOpen = false, queuePanelDirty = false, diyPlayerMode = true, emptyHomeActive = false, homeForcedOpen = false, visualGuideActive = false;
var playbackVisualPreset = 0, startupVisualPreviewActive = false, startupRestoreHomePending = false;
var startupAutoplayPreference = false, startupFastSkipPreference = false, startupResumeModePreference = 'none', closeBehaviorPreference = 'quit';
var immersiveMode = false, immersiveState = { shelfMode: null, shelfPinnedOpen: false, lyrics: true, controlsAutoHide: true, bottomVisible: false };
var pointerParallax = { x: 0, y: 0 }, pointerTarget = { x: 0, y: 0 }, headParallax = { x: 0, y: 0, active: false }, headNeutral = null;
var gestureRotation = { x: 0, y: 0 }, particleSpin = { vx: 0, vy: 0, damping: .90 }, pinchState = { active: false };
var presetTransition = { active: false, start: -10, duration: .92, from: 0, to: 0 }, peekTimers = { fx: null, search: null, pl: null };
var renderPerfState = { lastRenderAt: 0, fps: 0 }, mainFrameGates = {}, runtimeHardwareProfile = { lowSpec: false };
var sonicAudioMonitorState = { enabled: false }, localBeatAnalysis = { busy: false };
function readSavedVolume() { return .8; }
function isDeepBackgroundMode() { return document.hidden; }
function isHiddenForBackgroundOptimization() { return document.hidden; }
function runtimePerfBudgetLevel() { return 0; }
function runtimeAnalysisStride() { return 1; }
function installRenderPowerHooks() {}
function applyRendererPowerMode() {}
function wakeMainLoopFromBackground() {}
function getAdjustedLyricPlaybackTime(time) { var offset = stageSnapshot && isFinite(stageSnapshot.lyricTime) ? stageSnapshot.lyricTime - stageSnapshot.currentTime : 0; return (time == null ? audio.currentTime : time) + offset; }
function getProgressDragPreviewSeconds() { return isProgressDragPreviewActive() ? audio.currentTime : null; }
// The donor's still-preview path also keeps a paused seek and a newly selected lyric style readable.
function isProgressDragPreviewActive() { return !!(stageSnapshot && (stageSnapshot.reducedMotion || stageSnapshot.paused) && stageSnapshot.showLyrics); }
function isTypingTarget(node) { return node && /^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName); }
function escHtml(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]; }); }
function songCoverSrc(song) { return song && (song.cover || song.coverUrl) || ''; }
function songProviderKey(song) { return song && song.provider || 'local'; }
function songSourceTagHtml() { return ''; }
function songVipTagHtml() { return ''; }
function queueItemKey(song) { return String(song && song.id || ''); }
function cloneSong(song) { return Object.assign({}, song); }
function hasAnyPlatformLogin() { return userPlaylists.length > 0; }
function isSongLiked() { return false; }
function coverProxySrc(src) { return src; }
function isInlineCoverSrc(src) { return /^(data:|blob:|file:|local-audio:)/.test(src); }
function cssImageUrl(src) { return 'url(' + JSON.stringify(String(src || '')) + ')'; }
function showToast(text) { var el = document.getElementById('toast'); if (!el) return; el.textContent = text; el.classList.add('show'); setTimeout(function () { el.classList.remove('show'); }, 2200); }
function saveLyricLayout() { if (typeof fx !== 'undefined') stageCommand('settings', Object.assign({}, fx)); }
function scheduleLyricLayoutSave() { saveLyricLayout(); }
function saveBooleanPreference(key, value) { stageCommand('settings', Object.fromEntries([[key, value]])); }
function setPeek(element, visible, key) { if (typeof element === 'string') element = document.getElementById(element === 'fx' ? 'fx-panel' : element); if (!element) return; element.classList.toggle('peek', !!visible); if (key === 'fx' || element.id === 'fx-panel') document.getElementById('fx-fab').classList.toggle('active', !!visible); }
function togglePlaylistPanel() { stageCommand('openLibrary'); }
function switchPlaylistTab() { stageCommand('openLibrary'); }
function playQueueAt(index) { if (playQueue[index]) stageCommand('selectTrack', String(playQueue[index].id)); }
function loadPlaylistIntoQueueById(id, play, title, options) { if (options && options.seedTracks && options.seedTracks[options.startIndex]) stageCommand('selectTrack', String(options.seedTracks[options.startIndex].id)); else stageCommand('selectCollection', String(id).replace(/^mineradio:/, '')); return Promise.resolve(); }
function builtInPlaylistTracksPage(id, options) { var collection = stageSnapshot && stageSnapshot.collections.find(function (item) { return String(item.id) === String(id); }); var tracks = collection && collection.tracks || []; var offset = options && options.offset || 0, limit = options && options.limit || 48; return Promise.resolve({ tracks: tracks.slice(offset, offset + limit).map(function (track) { return { id: track.id, name: track.title, artist: track.artist, cover: track.cover }; }), total: tracks.length, hasMore: offset + limit < tracks.length, nextOffset: Math.min(tracks.length, offset + limit) }); }
function loadPodcastRadioIntoQueue() { stageCommand('openLibrary'); }
function setShelfHoverTabVisible() {}
function isFullscreenPlaylistQueueFocusLockedAtEdge() { return false; }
function updateEmptyHomeVisibility() {}
function setHomeControlsLocked() {}
function playShelfSelectTick() {} // No synthetic audio feedback alongside the shared player.
function pulseObjectValue(object, key, value, duration) { gsap.fromTo(object, Object.fromEntries([[key, value]]), { [key]: 0, duration: duration || .45, overwrite: true }); }
function applyParticleSpinDrag(dx, dy, dt) { MineradioStageMotion.drag(gestureRotation, particleSpin, dx, dy, dt); }
function resetParticleRotationTarget() { gestureRotation.x = gestureRotation.y = particleSpin.vx = particleSpin.vy = 0; }
function idleGuidePointerDown() {} function idleGuidePointerMove() {} function idleGuidePointerUp() {} function idleGuidePointerLeave() {} function idleGuideWheel() {}
function normalizeLyricTranslationText(value) { return String(value || '').trim(); }
function isDevelopmentLockedFx(key) { return /^(desktopLyrics|desktopLyricsClickThrough|desktopLyricsCinema|desktopLyricsHighlight|wallpaperMode|cam|aiDepth|gesture|aiLyrics)/.test(key); }
function normalizeDevelopmentLockedFxState(state) { return state; }
function normalizeControlGlassChromaticOffset(value) { return clampRange(Number(value) || 0, 0, 20); }
function applyControlGlassChromaticOffset() {} function applyPlaylistPanelFxSettings() {}
function updateControlsAutoHideFromPointer() {} function updateUserCapsuleAutoHideFromPointer() {} function updateFxFabAutoHideFromPointer() {}
function updateFullscreenDiyPeekFromPointer() {} function updateVisualGuidePointer() {}
function updatePlaybackQualityUi() {} function refreshSonicAudioMonitorUi() {}
function updateRenderPowerClasses() {} function resetFrameGate() {} function scheduleMainRendererViewportRefresh() { stageResize(); }
function ensureAudiblePlaybackGain() {} function syncPodcastDjMapCursor() {}
function setCloseBehaviorPreference() {} function setStartupResumeModePreference() {} function applyStartupAutoplayUi() {}
function applyGestureSettingsUi() {} function syncGestureCameraUi() {} function startGestureControl() {} function stopGestureControl() {}
function refreshStageLyricDisplayMode() { stageRefreshLyrics(true); }
function updateLyricTimingOffsetUi() {}
function pushDesktopLyricsState() {} function pushWallpaperState() {} function syncWallpaperEngineCaptureFrameRate() {}
function desktopInteractionHotkeyHint() { return ''; }
function renderUserFxArchives() {} function renderQueuePanel() {}
function hideAIDepthChip() {} function hideBeatChip() {}
function closeMiniQueue() { miniQueueOpen = false; document.getElementById('mini-queue-popover').classList.remove('show'); }
function closeGsapModal(el) { if (el) el.classList.remove('show'); }
function stageResize() { if (typeof stageViewportRevision === 'number') stageViewportRevision++; if (typeof renderer !== 'undefined') { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setPixelRatio(getRenderPixelRatio()); renderer.setSize(innerWidth, innerHeight); if (uniforms && uniforms.uPixel) uniforms.uPixel.value = renderer.getPixelRatio(); } }
function getDesktopWindowApi() { return null; } // Graphics realm has no privileged IPC; visual imports use browser file APIs.
