import React from 'react';
import fs from 'node:fs';
import { parseAst, transformWithOxc } from 'vite';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { currentTime } from '@/stores/motionSignals';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { PlayerState, type SongResult } from '@/types';
import { acknowledgesMediaSource } from '@/services/immersion/mediaAcknowledgement';

// Execute App's actual audio-deck callbacks without mounting unrelated application services.
const source = fs.readFileSync(new URL('../../../src/App.tsx', import.meta.url), 'utf8');
let factorySource = '';
const findFactory = (node: any): void => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'VariableDeclarator' && node.id?.name === 'renderAudioDeck') factorySource = source.slice(node.init.start, node.init.end);
    Object.values(node).forEach(value => {
        if (Array.isArray(value)) value.forEach(findFactory);
        else findFactory(value);
    });
};
findFactory(parseAst(source, { lang: 'tsx' }));
const compiled = (await transformWithOxc(`exports.renderAudioDeck = ${factorySource};`, 'audioDeck.tsx', { jsx: { runtime: 'classic' } })).code;
const local: SongResult = { id: 'local', name: 'Local', artists: [], album: { id: '', name: '' }, durationMs: 180000, sourceRef: { kind: 'local', mediaId: 'local' } };
const external = { ...local, id: 'native', sourceRef: { kind: 'online', providerId: 'spotify', mediaId: 'native' } } as SongResult;

function deckHandlers() {
    const ports = {
        acknowledgesMediaSource, document: { baseURI: 'https://app/' },
        immersion: { onPlaying: vi.fn(), onEnded: vi.fn(() => false), takePendingSeek: vi.fn(() => null) },
        React, PlayerState, usePlaybackStore, omni: { hasExternalPlayback: (song: SongResult) => song.sourceRef?.kind === 'online' },
        automix: { deckSrc: () => 'blob:local', activeDeck: 'A', isActiveDeck: () => true, isTransitionAudible: () => false,
            checkTransitionPoint: vi.fn(), handleTailEnded: vi.fn(), handleActiveDeckPlaying: vi.fn() },
        effectiveLoopMode: 'off', isShowingTail: false, shouldAutoPlay: { current: true }, audioSrc: 'blob:local', currentSong: local,
        currentTime, setDuration: usePlaybackStore.getState().setDuration, setPlayerState: usePlaybackStore.getState().setPlayerState,
        consumeProgrammaticPause: () => false, setupAudioAnalyzer: vi.fn(), playbackAutoSkipCountRef: { current: 3 },
        lastAudioRecoverySourceRef: { current: 'local' }, notePreviewPlaying: vi.fn(), t: (text: string) => text,
        loopPositionRef: { current: null }, hasLoopedToStart: () => false, cacheSongAssets: vi.fn(),
        playbackFade: { isFadingOut: () => false, flush: vi.fn() }, handleNextTrack: vi.fn(), pendingResumeTimeRef: { current: null },
        MediaError: { MEDIA_ERR_DECODE: 3 }, isLocalPlaybackSong: () => true, isNavidromePlaybackSong: () => false, isStagePlaybackSong: () => false,
        LOCAL_TAIL_DECODE_ERROR_TOLERANCE_SEC: .5, endLoadingToPlay: vi.fn(), handleTranscodeFallback: vi.fn(() => false),
        handleOnlineMediaFailure: vi.fn(), recoverOnlinePlaybackSource: vi.fn(), skipAfterPlaybackFailure: vi.fn(), playerState: PlayerState.PLAYING,
    };
    const exports: { renderAudioDeck?: (...args: unknown[]) => React.ReactElement<Record<string, (event: unknown) => void>> } = {};
    new Function(...Object.keys(ports), 'exports', compiled)(...Object.values(ports), exports);
    const deck = exports.renderAudioDeck!('A', () => {});
    return { handlers: deck.props, ports };
}

beforeEach(() => {
    usePlaybackStore.setState({ currentSong: local, duration: 180, playerState: PlayerState.PLAYING });
    currentTime.set(42);
});

describe('local audio event ownership', () => {
    it.each(['onPlay', 'onPlaying', 'onPause', 'onTimeUpdate', 'onSeeked', 'onEnded', 'onLoadedMetadata', 'onError'])(
        'ignores a late %s after the current source changes to native playback', event => {
            const { handlers, ports } = deckHandlers();
            usePlaybackStore.setState({ currentSong: external });
            handlers[event]({ currentTarget: { currentTime: 7, duration: 600, paused: event === 'onPause', ended: false,
                currentSrc: 'blob:local', error: event === 'onError' ? { code: 3 } : null, loop: false, pause: vi.fn() } });
            expect(currentTime.get()).toBe(42);
            expect(usePlaybackStore.getState()).toMatchObject({ duration: 180, playerState: PlayerState.PLAYING });
            expect(ports.shouldAutoPlay.current).toBe(true);
            expect(ports.handleNextTrack).not.toHaveBeenCalled();
            expect(ports.automix.checkTransitionPoint).not.toHaveBeenCalled();
            expect(ports.setupAudioAnalyzer).not.toHaveBeenCalled();
            expect(ports.endLoadingToPlay).not.toHaveBeenCalled();
            expect(ports.skipAfterPlaybackFailure).not.toHaveBeenCalled();
        },
    );

    it.each(['onPlay', 'onPlaying'])('pauses a late local %s so two sources cannot sound together', event => {
        const { handlers } = deckHandlers();
        usePlaybackStore.setState({ currentSong: external });
        const element = { paused: false, pause() { this.paused = true; } };
        handlers[event]({ currentTarget: element });
        expect(element.paused).toBe(true);
        expect(usePlaybackStore.getState().playerState).toBe(PlayerState.PLAYING);
    });

    it('keeps local metadata and playback events controlling the local clock', () => {
        const { handlers } = deckHandlers();
        const currentTarget = { currentTime: 7, duration: 600, currentSrc: 'blob:local' };
        handlers.onLoadedMetadata({ currentTarget });
        expect(currentTime.get()).toBe(0);
        expect(usePlaybackStore.getState().duration).toBe(600);
        handlers.onPlay({ currentTarget });
        expect(currentTime.get()).toBe(7);
    });

    it('does not acknowledge a prior media URL for a newly selected recording', () => {
        const { handlers, ports } = deckHandlers();
        const currentTarget = { currentTime: 7, duration: 600, currentSrc: 'blob:previous' };
        handlers.onPlaying({ currentTarget });
        handlers.onLoadedMetadata({ currentTarget });
        expect(ports.immersion.onPlaying).not.toHaveBeenCalled();
        expect(ports.immersion.takePendingSeek).not.toHaveBeenCalled();
    });
});
