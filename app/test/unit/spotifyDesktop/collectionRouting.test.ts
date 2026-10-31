import { describe, expect, it, vi } from 'vitest';
import { buildHomeModel } from '@/components/app/home/buildHomeModel';
import type { SongResult } from '@/types';

// A locator describes where a queue started; native context requires separate verified collection data.
const context = { providerId: 'spotify', type: 'playlist', id: 'a'.repeat(22) } as const;
const collection = { ...context, source: 'online', name: 'Games' } as const;
const song = { id: 'b'.repeat(22), name: 'Track', artists: [], album: { id: '', name: '' }, durationMs: 120000, sourceRef: { kind: 'online', providerId: 'spotify', mediaId: 'b'.repeat(22) } } as SongResult;
function home() {
    const playSong = vi.fn();
    const playAll = vi.fn();
    const model = buildHomeModel({ playSong, playAll } as unknown as Parameters<typeof buildHomeModel>[0]);
    return { surface: model.surfaceProps, playSong, playAll };
}
describe('verified native collection routing', () => {
    it('forwards explicit verified context for a selected track', () => {
        const { surface, playSong } = home();
        surface.onPlaySong(song, [song], false, collection, context);
        expect(playSong).toHaveBeenCalledWith(song, [song], false, { externalContext: context });
    });
    it('forwards explicit verified context for Play all', () => {
        const { surface, playAll } = home();
        surface.onPlayAll!([song], collection, context);
        expect(playAll).toHaveBeenCalledWith([song], { externalContext: context });
    });
    it('does not infer native context from a collection locator on a subset', () => {
        const { surface, playAll } = home();
        surface.onPlayAll!([song], collection);
        expect(playAll).toHaveBeenCalledWith([song]);
    });
});
