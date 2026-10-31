import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TFunction } from 'i18next';
import { createLibraryMutationPort } from '@/library/app/createLibraryMutationPort';
import type { HomeSurfaceProps } from '@/components/app/home/homeSurfaceTypes';
import type { LocalGridViewCollectionDescriptor } from '@/library/core/collection/collection.contract';

// Playlist deletion owns its cover cleanup; other collection edits preserve the frozen image.
const api = vi.hoisted(() => ({
    deletePlaylist: vi.fn(), updatePlaylist: vi.fn(), removeSongs: vi.fn(),
    clearCover: vi.fn(), deleteFolderSongs: vi.fn(),
}));
vi.mock('@/services/localMusicService', () => ({ deleteFolderSongs: api.deleteFolderSongs, resyncAllFolders: vi.fn(), resyncFolder: vi.fn() }));
vi.mock('@/services/localPlaylistService', () => ({ deleteLocalPlaylist: api.deletePlaylist, updateLocalPlaylist: api.updatePlaylist, removeSongsFromLocalPlaylist: api.removeSongs }));
vi.mock('@/services/localPlaylistFileService', () => ({ downloadLocalPlaylistM3u8: vi.fn() }));
vi.mock('@/services/navidromeService', () => ({ getNavidromeConfig: () => null, navidromeApi: {} }));
vi.mock('@/library/app/useLibraryHomeResources', () => ({ FAVORITE_ALBUMS_CHANGED_EVENT: 'favorite-albums-changed' }));
vi.mock('@/stores/useExploreFeedStore', () => ({ useExploreFeedStore: { getState: () => ({ noteSaved: vi.fn() }) } }));
vi.mock('@/library/core/collection/cover/localCollectionCovers.service', () => ({ localCollectionCovers: { clear: api.clearCover } }));

const collection: LocalGridViewCollectionDescriptor = { source: 'local', id: 'playlist-p', playlistId: 'p', type: 'playlist', name: 'Mix', songIds: [] };
const setup = () => {
    const refresh = vi.fn();
    const dialogs = { editCover: vi.fn(), editEntity: vi.fn(), organizeFolder: vi.fn(), matchSong: vi.fn() };
    const port = createLibraryMutationPort({
        surface: { onRefreshLocalSongs: refresh, localSongs: [], localPlaylists: [] } as unknown as HomeSurfaceProps,
        t: ((key: string) => key) as unknown as TFunction,
        dialogs,
        navidromePlaylists: [],
        refreshNavidromePlaylists: vi.fn(),
    });
    return { port, dialogs, refresh };
};

beforeEach(() => {
    vi.clearAllMocks();
    api.deletePlaylist.mockResolvedValue(undefined);
    api.clearCover.mockResolvedValue(undefined);
});

describe('local collection cover mutation host port', () => {
    it('opens the cover dialog for the exact local collection', async () => {
        const { port, dialogs } = setup();
        await port.local?.editCover?.(collection);
        expect(dialogs.editCover).toHaveBeenCalledExactlyOnceWith(collection);
    });

    it('removes a deleted playlist cover and refreshes the local library', async () => {
        const { port, refresh } = setup();
        await port.local?.deletePlaylist?.('p');
        expect(api.deletePlaylist).toHaveBeenCalledExactlyOnceWith('p');
        expect(api.clearCover).toHaveBeenCalledExactlyOnceWith('playlist:p');
        expect(refresh).toHaveBeenCalledOnce();
    });

    it('keeps the cover and library state when playlist deletion fails', async () => {
        api.deletePlaylist.mockRejectedValueOnce(new Error('delete failed'));
        const { port, refresh } = setup();
        await expect(port.local?.deletePlaylist?.('p')).rejects.toThrow('delete failed');
        expect(api.clearCover).not.toHaveBeenCalled();
        expect(refresh).not.toHaveBeenCalled();
    });

    it('preserves covers when renaming a playlist, removing songs or removing a folder index', async () => {
        const { port, refresh } = setup();
        await port.local?.renamePlaylist?.('p', ' New name ');
        await port.local?.removePlaylistSongs?.('p', ['s1']);
        const folder: LocalGridViewCollectionDescriptor = { source: 'local', type: 'folder', id: 'folder-Music', name: 'Music', songIds: [] };
        await port.local?.deleteFolder?.(folder);
        expect(api.updatePlaylist.mock.calls[0]?.[1]({ name: 'Old' })).toEqual({ name: 'New name' });
        expect(api.removeSongs).toHaveBeenCalledExactlyOnceWith('p', ['s1']);
        expect(api.deleteFolderSongs).toHaveBeenCalledExactlyOnceWith('Music');
        expect(api.clearCover).not.toHaveBeenCalled();
        expect(refresh).toHaveBeenCalledTimes(2);
    });
});
