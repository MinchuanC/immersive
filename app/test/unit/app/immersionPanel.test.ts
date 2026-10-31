// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ImmersionPanel from '../../../src/components/app/immersion/ImmersionPanel';
import type { ImmersionModel } from '../../../src/components/app/immersion/useImmersion';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('../../../src/components/shared/Sheet', () => ({
    default: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) => isOpen ? children : null,
    SheetButton: ({ variant: _variant, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => React.createElement('button', props),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
let host: HTMLDivElement | null = null;
const album = { key: 'album', name: 'Album', tracks: [{ songId: 'song', trackKey: 'recording', title: 'Song', durationSec: 120 }] };
const cue = { id: 'cue', trackKey: 'recording', atSec: 15, kind: 'bookmark', label: 'Moment' } as const;
const score: NonNullable<ImmersionModel['score']> = { version: 1, trackKey: 'recording', durationSec: 120, seed: 1, evidence: { kind: 'local-analysis', profileVersion: 1 }, cues: [] };
const model = (overrides: Partial<ImmersionModel> = {}) => ({
    isOpen: true, setOpen: vi.fn(), song: null, local: false, scoreSupported: false, scoreWaiting: false, openImmersiveLyrics: vi.fn(), currentAlbum: undefined, albums: [], selectedAlbum: undefined,
    setSelectedAlbumKey: vi.fn(), scoreEnabled: false, score: null, analyzing: false, edition: null, editionEnabled: false,
    journey: null, busy: false, error: false, saved: false, label: '', setLabel: vi.fn(), startScore: vi.fn(), stopVisuals: vi.fn(),
    useEdition: vi.fn(), save: vi.fn(), replay: vi.fn(), removeCue: vi.fn(), startJourney: vi.fn(), resumeJourney: vi.fn(),
    leaveJourney: vi.fn(), onEnded: vi.fn(), takePendingSeek: vi.fn(), ...overrides,
}) as unknown as ImmersionModel;
const render = async (value: ImmersionModel) => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root!.render(React.createElement(ImmersionPanel, { model: value })));
};
const button = (key: string) => Array.from(host!.querySelectorAll('button')).find(node => node.textContent === `immersion.${key}`)!;

afterEach(async () => {
    await act(async () => root?.unmount());
    host?.remove(); root = null; host = null;
});

describe('the listening experience panel', () => {
    it('explains unsupported playback and disables actions that need local musical signals', async () => {
        await render(model());
        expect(host!.textContent).toContain('immersion.localGuidance');
        expect(host!.textContent).toContain('immersion.analysisUnsupported');
        expect(host!.textContent).not.toContain('immersion.analysisReady');
        expect(button('startScore').disabled).toBe(true);
        expect(button('keepLook').disabled).toBe(true);
        expect(button('startJourney').disabled).toBe(true);
    });

    it('does not show a previous local analysis as ready for unsupported playback', async () => {
        await render(model({ local: false, scoreEnabled: true, score }));
        expect(host!.textContent).toContain('immersion.analysisUnsupported');
        expect(host!.textContent).not.toContain('immersion.analysisComplete');
    });

    it.each([{ local: true, score: null, active: false }, { local: false, score, active: false }, { local: true, score, active: true }])('shows Score activity only when current playback has eligible analysis ($local / $active)', async ({ local, score: data, active }) => {
        await render(model({ local, scoreSupported: local, scoreEnabled: true, score: data }));
        expect(host!.textContent?.includes('immersion.active')).toBe(active);
    });

    it('enables Song Score for supported immersive Spotify playback', async () => {
        await render(model({ local: false, scoreSupported: true }));
        expect(button('startScore').disabled).toBe(false);
        expect(host!.textContent).not.toContain('immersion.analysisUnsupported');
    });

    it('offers Immersive Lyrics explicitly and explains Spotify editions are local-only', async () => {
        const value = model({ song: {} as never, local: false, scoreSupported: true, currentAlbum: album });
        await render(value);
        expect(host!.textContent).toContain('immersion.editionsLocalOnly');
        expect(host!.textContent).not.toContain('immersion.albumNeeded');
        await act(async () => button('openImmersiveLyrics').click());
        expect(value.openImmersiveLyrics).toHaveBeenCalledOnce();
    });

    it('distinguishes waiting for Spotify playback from unavailable audio analysis', async () => {
        await render(model({ scoreSupported: true, scoreEnabled: true, scoreWaiting: true }));
        expect(host!.textContent).toContain('immersion.analysisWaiting');
        expect(host!.textContent).not.toContain('immersion.analysisUnavailable');
    });

    it('does not label a retained Edition active on unsupported playback', async () => {
        await render(model({ local: false, editionEnabled: true }));
        expect(host!.textContent).not.toContain('immersion.active');
    });

    it('connects authoring and saved moments to the real model actions', async () => {
        const value = model({ local: true, canKeepLook: true, currentAlbum: album, albums: [album], selectedAlbum: album,
            edition: { version: 1, scoreVersion: 1, id: 'album', albumKey: 'album', albumName: 'Album', updatedAt: 0, cues: [cue] } });
        await render(value);
        await act(async () => { button('less').click(); button('more').click(); button('rememberPassage').click(); button('replay').click(); button('remove').click(); });
        expect(value.save).toHaveBeenCalledWith('look', -.15);
        expect(value.save).toHaveBeenCalledWith('look', .15);
        expect(value.save).toHaveBeenCalledWith('bookmark');
        expect(value.replay).toHaveBeenCalledWith(cue);
        expect(value.removeCue).toHaveBeenCalledWith('cue');
        expect(host!.textContent).toContain('0:15');
    });

    it.each([
        { version: 2, scoreVersion: 1, cues: [cue] },
        { version: 1, scoreVersion: 1, cues: [null, { atSec: 'invalid' }] },
    ])('preserves unsupported editions without exposing mutation or crashing', async edition => {
        const value = model({ local: true, currentAlbum: album, edition: edition as unknown as ImmersionModel['edition'] });
        await render(value);
        expect(host!.textContent).toContain('immersion.incompatible');
        expect(button('keepLook').disabled).toBe(true);
        expect(button('useEdition').disabled).toBe(true);
        expect(value.save).not.toHaveBeenCalled();
    });

    it('keeps an unsupported visual recipe removable without offering a replay that cannot work', async () => {
        const look = { ...cue, kind: 'look' as const, recipe: { futureShader: 1 } };
        const value = model({ local: true, currentAlbum: album, editionEnabled: true,
            edition: { version: 1, scoreVersion: 1, id: 'album', albumKey: 'album', albumName: 'Album', updatedAt: 0, cues: [look] } as unknown as ImmersionModel['edition'] });
        await render(value);
        expect(host!.textContent).toContain('immersion.unsupportedRecipe');
        expect(button('useEdition').disabled).toBe(true);
        expect(button('replay').disabled).toBe(true);
        expect(button('remove').disabled).toBe(false);
        expect(host!.textContent).not.toContain('immersion.active');
        await act(async () => button('remove').click());
        expect(value.removeCue).toHaveBeenCalledWith(look.id);
        expect(value.replay).not.toHaveBeenCalled();
    });
});
