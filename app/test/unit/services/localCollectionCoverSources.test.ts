import { afterEach, describe, expect, it, vi } from 'vitest';
import { findLocalFolderPoster, loadLocalSongCoverBlob, prepareLocalCollectionCoverImage } from '@/services/localCollectionCoverSources';

// Cover sources read an image once; they never change the source file or song artwork.
const sources = vi.hoisted(() => ({ getDirHandles: vi.fn(), fetchCoverBlob: vi.fn() }));
vi.mock('@/services/db', () => ({ getDirHandles: sources.getDirHandles }));
vi.mock('@/services/coverCache', () => ({ fetchCoverBlob: sources.fetchCoverBlob }));
vi.mock('@/services/localCoverAssetUrl', () => ({ isLocalCoverAssetUrl: (url: string) => url.startsWith('asset:') }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('local collection cover sources', () => {
    it('rejects empty uploads before decoding and preserves a small decoded PNG', async () => {
        const close = vi.fn();
        const decode = vi.fn(async () => ({ width: 256, height: 128, close }));
        vi.stubGlobal('createImageBitmap', decode);
        await expect(prepareLocalCollectionCoverImage(new Blob())).rejects.toThrow('empty');
        expect(decode).not.toHaveBeenCalled();
        const image = new Blob(['png'], { type: 'image/png' });
        expect(await prepareLocalCollectionCoverImage(image)).toBe(image);
        expect(close).toHaveBeenCalledOnce();
    });

    it('bounds oversized images and closes their decoded bitmap', async () => {
        const close = vi.fn();
        vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4096, height: 2048, close })));
        const encoded = new Blob(['webp'], { type: 'image/webp' });
        const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: vi.fn(), imageSmoothingQuality: '' }), toBlob: (done: (blob: Blob) => void) => done(encoded) };
        vi.stubGlobal('document', { createElement: () => canvas });
        expect(await prepareLocalCollectionCoverImage(new Blob(['png'], { type: 'image/png' }))).toBe(encoded);
        expect([canvas.width, canvas.height]).toEqual([1024, 512]);
        expect(close).toHaveBeenCalledOnce();
    });

    it('does not request directory permission until explicitly allowed', async () => {
        const requestPermission = vi.fn(async () => 'denied');
        sources.getDirHandles.mockResolvedValue({ Music: { queryPermission: async () => 'prompt', requestPermission } });
        expect(await findLocalFolderPoster('Music/Album')).toEqual({ status: 'no-access' });
        expect(requestPermission).not.toHaveBeenCalled();
        expect(await findLocalFolderPoster('Music/Album', { requestAccess: true })).toEqual({ status: 'no-access' });
        expect(requestPermission).toHaveBeenCalledExactlyOnceWith({ mode: 'read' });
    });

    it('looks in the requested folder and prefers a case-insensitive poster PNG', async () => {
        const image = new Blob(['poster'], { type: 'image/png' });
        const directory = { values: async function* () {
            yield { kind: 'file', name: 'poster.jpg', getFile: async () => new Blob(['jpg']) };
            yield { kind: 'file', name: 'POSTER.PNG', getFile: async () => image };
        } };
        const getDirectoryHandle = vi.fn(async () => directory);
        sources.getDirHandles.mockResolvedValue({ Music: { getDirectoryHandle } });
        expect(await findLocalFolderPoster('Music/Album')).toEqual({ status: 'found', file: image });
        expect(getDirectoryHandle).toHaveBeenCalledExactlyOnceWith('Album');
    });

    it('loads song cover bytes through the existing cover cache', async () => {
        const image = new Blob(['song'], { type: 'image/webp' });
        sources.fetchCoverBlob.mockResolvedValueOnce(image);
        expect(await loadLocalSongCoverBlob(['https://image.test/cover'], 's1')).toBe(image);
        expect(sources.fetchCoverBlob).toHaveBeenCalledExactlyOnceWith('https://image.test/cover');
    });
});
