// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// A reapply failure must be visible once until the chosen device works again.
vi.hoisted(() => {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key), clear: () => values.clear(),
    } });
});

vi.mock('react-i18next', async importOriginal => ({
    ...await importOriginal<typeof import('react-i18next')>(),
    useTranslation: () => ({ t: translate }),
}));
const translate = (key: string) => key;
const { useAudioOutputDevice } = await import('@/hooks/useAudioOutputDevice');
const { useAudioSettingsStore } = await import('@/stores/useAudioSettingsStore');
const { usePlaybackStore } = await import('@/stores/usePlaybackStore');
const { useStatusMessageStore } = await import('@/stores/useStatusMessageStore');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
type SinkElement = HTMLAudioElement & { sinkId: string; setSinkId: (id: string) => Promise<void> };
let changeDevice: (id: string) => Promise<boolean>;

const mountWith = (setSinkId: (id: string) => Promise<void>) => {
    const element = document.createElement('audio') as SinkElement;
    element.sinkId = '';
    element.setSinkId = vi.fn(setSinkId);
    const audioRef = { current: element };
    const audioContextRef = { current: null };
    const gainNodeRef = { current: null };
    function Probe() {
        changeDevice = useAudioOutputDevice({ audioRef, audioContextRef, gainNodeRef }).handleAudioOutputDeviceChange;
        return null;
    }
    root = createRoot(document.createElement('div'));
    act(() => root!.render(React.createElement(Probe)));
    return element;
};
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const message = () => useStatusMessageStore.getState().message;
const retry = async (element: SinkElement) => {
    useStatusMessageStore.setState({ message: null });
    await act(async () => { element.dispatchEvent(new Event('loadedmetadata')); await flush(); });
};

beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    useStatusMessageStore.setState({ message: null });
    usePlaybackStore.setState({ audioSrc: 'blob:one' });
    useAudioSettingsStore.setState({ audioOutputDeviceId: 'dac' });
});
afterEach(() => {
    act(() => root?.unmount());
    root = null;
    vi.restoreAllMocks();
});

describe('useAudioOutputDevice', () => {
    it('reports a missing selected device once across metadata, canplay and source retries', async () => {
        const element = mountWith(async () => { throw new DOMException('Requested device not found', 'NotFoundError'); });
        await act(flush);
        expect(message()).toEqual({ type: 'error', text: 'options.audioOutputMissing', note: 'options.audioOutputFallbackNote' });
        await retry(element);
        await act(async () => { element.dispatchEvent(new Event('canplay')); await flush(); });
        await act(async () => { usePlaybackStore.setState({ audioSrc: 'blob:two' }); await flush(); });
        expect(message()).toBeNull();
        expect(element.setSinkId).toHaveBeenCalledTimes(4);
    });

    it('reports other reapply errors without claiming the device is missing', async () => {
        mountWith(async () => { throw new DOMException('Device busy', 'NotAllowedError'); });
        await act(flush);
        expect(message()).toEqual({ type: 'error', text: 'options.audioOutputNotApplied', note: 'options.audioOutputFallbackNote' });
    });

    it.each([false, true])('reports a later failure after a successful apply (already applied: %s)', async alreadyApplied => {
        let fails = true;
        const element = mountWith(async () => { if (fails) throw new DOMException('Device busy', 'NotAllowedError'); });
        await act(flush);
        fails = false;
        if (alreadyApplied) element.sinkId = 'dac';
        await retry(element);
        expect(message()).toBeNull();
        element.sinkId = '';
        fails = true;
        await retry(element);
        expect(message()?.text).toBe('options.audioOutputNotApplied');
    });

    it('reports the newly selected device after a different device failed', async () => {
        mountWith(async () => { throw new DOMException('Device busy', 'NotAllowedError'); });
        await act(flush);
        useStatusMessageStore.setState({ message: null });
        await act(async () => { useAudioSettingsStore.setState({ audioOutputDeviceId: 'another-dac' }); await flush(); });
        expect(message()?.text).toBe('options.audioOutputNotApplied');
    });

    it.each([false, true])('preserves playback after an explicit default-device switch (fails: %s)', async fails => {
        useAudioSettingsStore.setState({ audioOutputDeviceId: '' });
        const element = mountWith(async () => { if (fails) throw new DOMException('Device busy', 'NotAllowedError'); });
        await act(flush);
        let paused = false;
        Object.defineProperty(element, 'paused', { configurable: true, get: () => paused });
        const actions: string[] = [];
        element.pause = vi.fn(() => { actions.push('pause'); paused = true; });
        element.play = vi.fn(async () => { actions.push('play'); paused = false; });
        element.setSinkId = vi.fn(async id => {
            actions.push(id);
            if (fails) throw new DOMException('Device busy', 'NotAllowedError');
            element.sinkId = id;
        });
        let applied: boolean | undefined;
        await act(async () => { applied = await changeDevice('default'); });
        expect(applied).toBe(!fails);
        expect(actions).toEqual(['pause', 'default', 'play']);
        expect(paused).toBe(false);
        expect(message()?.text ?? null).toBe(fails ? 'options.audioOutputSelectFailed' : null);
    });
});
