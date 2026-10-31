import { describe, expect, it } from 'vitest';
import { acknowledgesMediaSource } from '../../../src/services/immersion/mediaAcknowledgement';

describe('media acknowledgement', () => {
    it('rejects stale and empty deck sources', () => {
        expect(acknowledgesMediaSource({ currentSrc: 'blob:https://app/old' }, 'blob:https://app/new', 'https://app/')).toBe(false);
        expect(acknowledgesMediaSource({ currentSrc: '' }, 'file:///music/song.flac', 'https://app/')).toBe(false);
        expect(acknowledgesMediaSource({ currentSrc: 'file:///music/song.flac' }, 'file:///music/song.flac', 'https://app/')).toBe(true);
        expect(acknowledgesMediaSource({ currentSrc: 'https://app/music.wav' }, '/music.wav', 'https://app/')).toBe(true);
    });
});
