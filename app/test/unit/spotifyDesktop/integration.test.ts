import { createRequire } from 'node:module';
import { expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { createSpotifyIntegration: createIntegration } = require('../../../electron/spotify/integration.cjs');

it('keeps both playback bridges isolated behind the main-window IPC guard', async () => {
    const desktop = { request: vi.fn().mockResolvedValue('desktop'), dispose: vi.fn() };
    const embedded = { requestEmbedded: vi.fn().mockResolvedValue('embedded'), handleAudioRequest: vi.fn(), shutdown: vi.fn() };
    const handlers = new Map<string, Function>();
    const protocol = { handle: vi.fn() };
    const integration = createIntegration({ session: {}, store: {}, safeStorage: {}, shell: {}, openExternal: vi.fn(), language: () => 'en',
        createDesktop: () => desktop, createEmbedded: () => embedded });
    integration.registerIpc({ handle: (name: string, handler: Function) => handlers.set(name, handler) }, (sender: unknown) => sender === 'trusted');
    integration.registerProtocol(protocol);
    expect(await handlers.get('spotify-api-request')!({ sender: 'trusted' }, 'query', { id: 'one' })).toBe('desktop');
    expect(await handlers.get('embedded-playback-request')!({ sender: 'trusted' }, 'spotify', 'audio', { id: 'two' })).toBe('embedded');
    expect(await handlers.get('embedded-playback-request')!({ sender: 'untrusted' }, 'spotify', 'audio', {})).toMatchObject({ ok: false });
    expect(await handlers.get('embedded-playback-request')!({ sender: 'trusted' }, 'other', 'audio', {})).toMatchObject({ ok: false });
    expect(embedded.requestEmbedded).toHaveBeenCalledOnce();
    expect(protocol.handle).toHaveBeenCalledWith('folia-spotify', expect.any(Function));
    const request = { url: 'test' };
    protocol.handle.mock.calls[0][1](request);
    expect(embedded.handleAudioRequest).toHaveBeenCalledWith(request);
});

