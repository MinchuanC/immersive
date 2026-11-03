import { describe, expect, it } from 'vitest';
import { createStageChannel, makeStageFrame } from '../../../src/integrations/mineradio/stageBridge';

// The graphics realm may control the shared player, but never own another player.
describe('MineRadio stage bridge', () => {
    it('sends Low Power independently of lyric timing and reduced motion', () => {
        const input = { currentTime: 5, lyricTime: 5.2, paused: false, showLyrics: true, reducedMotion: false };
        const standard = makeStageFrame(input);
        const low = makeStageFrame({ ...input, lowPowerMode: true });
        expect(low.lowPowerMode).toBe(true);
        expect(standard.lowPowerMode).toBe(false);
        expect({ ...low, lowPowerMode: false }).toEqual(standard);
    });
    it('reports console opening only from the active renderer session', () => {
        const target = { postMessage() {} };
        let opened = 0;
        const channel = createStageChannel(target, 'a', () => {}, undefined, undefined, () => opened++);
        const message = { scope: 'immersive-mineradio', session: 'a', type: 'consoleOpened' };
        channel.receive(message, {});
        channel.receive({ ...message, session: 'old' }, target);
        expect(opened).toBe(0);
        channel.receive(message, target);
        expect(opened).toBe(1);
        channel.dispose();
        channel.receive(message, target);
        expect(opened).toBe(1);
    });
    it('bounds score recipes and holds their motion in reduced mode', () => {
        const frame = makeStageFrame({ currentTime: 10, paused: true, reducedMotion: true, direction: {
            intensity: 5, sonicGroundAmplitude: -8, sonicGroundMotionSpeed: 70, sonicGroundGlow: Infinity,
        } });
        expect(frame.direction).toEqual({ intensity: 1.5, sonicGroundAmplitude: 0, sonicGroundMotionSpeed: 0, sonicGroundGlow: 0 });
        expect(makeStageFrame({ currentTime: 0, paused: true }).direction).toBeNull();
    });
    it('restores console focus only for the current stage session', () => {
        const target = { postMessage() {} };
        let closed = 0;
        const channel = createStageChannel(target, 'a', () => {}, undefined, () => closed++);
        const message = { scope: 'immersive-mineradio', session: 'a', type: 'consoleClosed' };
        channel.receive(message, {});
        channel.receive({ ...message, session: 'other' }, target);
        expect(closed).toBe(0);
        channel.receive(message, target);
        expect(closed).toBe(1);
        channel.dispose();
        channel.receive(message, target);
        expect(closed).toBe(1);
    });
    it('accepts commands only from its own renderer and session', () => {
        const target = { postMessage() {} };
        const actions: unknown[] = [];
        const channel = createStageChannel(target, 'stage-a', action => actions.push(action));
        const message = { scope: 'immersive-mineradio', session: 'stage-a', type: 'command', action: 'seek', value: 12 };
        channel.receive(message, {});
        channel.receive({ ...message, session: 'stage-b' }, target);
        channel.receive({ ...message, action: 'executeScript' }, target);
        channel.receive(message, target);
        expect(actions).toEqual([{ action: 'seek', value: 12 }]);
    });

    it('releases its renderer once and rejects late messages or frames', () => {
        const messages: unknown[] = [];
        const target = { postMessage(message: unknown) { messages.push(message); } };
        const actions: unknown[] = [];
        const channel = createStageChannel(target, 'stage-a', action => actions.push(action));
        channel.send({ currentTime: 2 });
        channel.dispose();
        channel.dispose();
        channel.send({ currentTime: 3 });
        channel.receive({ scope: 'immersive-mineradio', session: 'stage-a', type: 'command', action: 'playPause' }, target);
        expect(messages).toHaveLength(2);
        expect(messages[1]).toMatchObject({ type: 'dispose' });
        expect(actions).toEqual([]);
    });

    it('passes genuine timing and silence without manufacturing spectrum or word timings', () => {
        const lines = [{ fullText: 'Real line', startTime: 4, endTime: 8, words: [] }];
        const frame = makeStageFrame({ currentTime: 5, paused: false, duration: 30, lines, metadata: { title: 'Track' } });
        expect(frame.lyrics).toEqual(lines);
        expect(frame.audio).toEqual({ available: false, bass: 0, mid: 0, treble: 0, energy: 0, beat: 0, spectrum: [] });
        expect(frame.currentTime).toBe(5);
    });

    it('bounds the sixteen spatial regions while preserving legacy frames', () => {
        const audio = { bass: .3, mid: .2, treble: .1, energy: .25, regions: [-1, .5, 2, NaN, Infinity] };
        const frame = makeStageFrame({ currentTime: 1, paused: false, audio });
        expect(frame.audio.regions).toEqual([0, .5, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        expect(makeStageFrame({ currentTime: 1, paused: false, audio: { ...audio, regions: Array(20).fill(.4) } }).audio.regions).toHaveLength(16);
        expect(makeStageFrame({ currentTime: 1, paused: false, audio: { bass: .3, mid: .2, treble: .1, energy: .25 } }).audio).not.toHaveProperty('regions');
        expect(makeStageFrame({ currentTime: 1, paused: false, audio: null }).audio).not.toHaveProperty('regions');
    });

    it('bounds untrusted seek values and preset settings', () => {
        const target = { postMessage() {} };
        const actions: unknown[] = [];
        const channel = createStageChannel(target, 'stage-a', action => actions.push(action));
        const message = { scope: 'immersive-mineradio', session: 'stage-a', type: 'command', action: 'seek' };
        channel.receive({ ...message, value: Number.NaN }, target);
        channel.receive({ ...message, value: -1 }, target);
        channel.receive({ ...message, value: Infinity }, target);
        expect(actions).toEqual([]);
    });
    it('forwards only supported shortcuts from the active graphics session', () => {
        const target = { postMessage() {} };
        const keys: unknown[] = [];
        const channel = createStageChannel(target, 'a', () => {}, key => keys.push(key));
        const message = { scope: 'immersive-mineradio', session: 'a', type: 'shortcut', code: 'Space' };
        channel.receive(message, {});
        channel.receive({ ...message, code: 'KeyQ' }, target);
        channel.receive({ ...message, code: 'KeyK' }, target);
        channel.receive(message, target);
        channel.receive({ ...message, code: 'KeyK', metaKey: true }, target);
        expect(keys).toEqual([
            { code: 'Space', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false },
            { code: 'KeyK', ctrlKey: false, metaKey: true, altKey: false, shiftKey: false },
        ]);
    });
    it('limits lyric renderer commands to the two integrated renderers', () => {
        const target = { postMessage() {} };
        const actions: unknown[] = [];
        const channel = createStageChannel(target, 'a', action => actions.push(action));
        const message = { scope: 'immersive-mineradio', session: 'a', type: 'command', action: 'lyricsMode' };
        channel.receive({ ...message, value: 'unknown' }, target);
        channel.receive({ ...message, value: 'mineradio' }, target);
        expect(actions).toEqual([{ action: 'lyricsMode', value: 'mineradio' }]);
    });
});
