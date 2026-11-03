import type { Line } from '../../types';
import type { StageConsoleCopy } from './consoleCopy';
import type { ImmersionRecipe } from '../../types/immersion';

// A graphics-only channel: Folia retains the audio clock, queue, providers and library.
export const STAGE_SCOPE = 'immersive-mineradio';
export type StageSettings = Record<string, string | number | boolean>;
export interface StageMetadata { title?: string; artist?: string; album?: string; coverUrl?: string | null; trackKey?: string; }
export interface StageCollection { id: string; name: string; cover?: string; trackCount?: number; tracks?: StageTrack[]; }
export interface StageTrack { id: string; title: string; artist?: string; cover?: string; }
export interface StageAudio { bass: number; mid: number; treble: number; energy: number; beat?: number; spectrum?: Uint8Array; regions?: number[]; }
export interface StageInput {
    currentTime: number;
    lyricTime?: number;
    duration?: number;
    paused: boolean;
    metadata?: StageMetadata;
    lines?: Line[];
    wordTiming?: boolean;
    audio?: StageAudio | null;
    collections?: StageCollection[];
    queue?: StageTrack[];
    settings?: StageSettings;
    showControls?: boolean;
    showLyrics?: boolean;
    reducedMotion?: boolean;
    lowPowerMode?: boolean;
    lyricRendererLabel?: string;
    lyricRenderer?: 'folia' | 'mineradio';
    locale?: string;
    consoleCopy?: StageConsoleCopy;
    direction?: ImmersionRecipe | null;
    directionRevision?: number;
}
export type StageAction = 'playPause' | 'previous' | 'next' | 'seek' | 'volume' | 'openLibrary' | 'openSettings' | 'openFiles' | 'fullscreen' | 'selectCollection' | 'selectTrack' | 'settings' | 'openHome' | 'openPlayer' | 'openQueue' | 'connectSource' | 'lyricsMode';
export interface StageCommand { action: StageAction; value?: unknown; }
const ACTIONS = new Set<StageAction>(['playPause', 'previous', 'next', 'seek', 'volume', 'openLibrary', 'openSettings', 'openFiles', 'fullscreen', 'selectCollection', 'selectTrack', 'settings', 'openHome', 'openPlayer', 'openQueue', 'connectSource', 'lyricsMode']);
const unit = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

export function makeStageFrame(input: StageInput) {
    const audio = input.audio;
    return {
        currentTime: Math.max(0, Number.isFinite(input.currentTime) ? input.currentTime : 0),
        lyricTime: input.lyricTime,
        duration: Math.max(0, input.duration ?? 0),
        paused: input.paused,
        metadata: input.metadata ?? {},
        lyrics: input.lines ?? [],
        wordTiming: input.wordTiming === true,
        audio: {
            available: !!audio,
            bass: unit(audio?.bass ?? 0), mid: unit(audio?.mid ?? 0), treble: unit(audio?.treble ?? 0),
            energy: unit(audio?.energy ?? 0), beat: unit(audio?.beat ?? 0),
            spectrum: audio?.spectrum ? Array.from(audio.spectrum) : [],
            ...(audio?.regions ? { regions: Array.from({ length: 16 }, (_, index) => unit(audio.regions?.[index] ?? 0)) } : {}),
        },
        collections: input.collections ?? [],
        queue: input.queue ?? [],
        settings: input.settings,
        showControls: input.showControls !== false,
        showLyrics: input.showLyrics === true,
        reducedMotion: input.reducedMotion === true,
        lowPowerMode: input.lowPowerMode === true,
        lyricRendererLabel: input.lyricRendererLabel,
        lyricRenderer: input.lyricRenderer ?? 'folia',
        locale: input.locale,
        consoleCopy: input.consoleCopy,
        direction: input.direction ? {
            intensity: Math.max(.1, Math.min(1.5, Number(input.direction.intensity) || .1)),
            sonicGroundAmplitude: unit(input.direction.sonicGroundAmplitude / 100) * 100,
            sonicGroundMotionSpeed: input.reducedMotion ? 0 : unit(input.direction.sonicGroundMotionSpeed / 100) * 100,
            sonicGroundGlow: unit(input.direction.sonicGroundGlow / 100) * 100,
        } : null,
        directionRevision: input.directionRevision ?? 0,
    };
}

export interface StageShortcut { code: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; }
const SHORTCUTS = new Set(['Space', 'ArrowLeft', 'ArrowRight', 'Escape', 'KeyH', 'KeyP', 'KeyK']);
export function createStageChannel(target: { postMessage(message: unknown, origin: string): void }, session: string, onCommand: (command: StageCommand) => void, onShortcut?: (shortcut: StageShortcut) => void, onConsoleClosed?: () => void, onConsoleOpened?: () => void) {
    let disposed = false;
    const post = (type: string, payload?: unknown) => target.postMessage({ scope: STAGE_SCOPE, session, type, payload }, '*');
    return {
        send(frame: unknown) { if (!disposed) post('frame', frame); },
        openConsole() { if (!disposed) post('openConsole'); },
        receive(data: unknown, source: unknown) {
            if (disposed || source !== target || !data || typeof data !== 'object') return;
            const message = data as Record<string, unknown>;
            if (message.scope !== STAGE_SCOPE || message.session !== session) return;
            if (message.type === 'consoleOpened') { onConsoleOpened?.(); return; }
            if (message.type === 'consoleClosed') { onConsoleClosed?.(); return; }
            if (message.type === 'shortcut') {
                const code = message.code;
                if (typeof code !== 'string' || !SHORTCUTS.has(code) || (code === 'KeyK' && !message.ctrlKey && !message.metaKey)) return;
                onShortcut?.({ code, ctrlKey: message.ctrlKey === true, metaKey: message.metaKey === true, altKey: message.altKey === true, shiftKey: message.shiftKey === true });
                return;
            }
            if (message.type !== 'command' || !ACTIONS.has(message.action as StageAction)) return;
            if (message.action === 'seek' && (typeof message.value !== 'number' || !Number.isFinite(message.value) || message.value < 0)) return;
            if (message.action === 'volume' && (typeof message.value !== 'number' || !Number.isFinite(message.value) || message.value < 0 || message.value > 1)) return;
            if ((message.action === 'selectTrack' || message.action === 'selectCollection') && typeof message.value !== 'string') return;
            if (message.action === 'settings' && (!message.value || typeof message.value !== 'object' || Array.isArray(message.value))) return;
            if (message.action === 'lyricsMode' && message.value !== 'folia' && message.value !== 'mineradio') return;
            onCommand({ action: message.action as StageAction, ...(message.value !== undefined ? { value: message.value } : {}) });
        },
        dispose() { if (!disposed) { post('dispose'); disposed = true; } },
    };
}
