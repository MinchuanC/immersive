// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { ExternalConnectionSetup } from '@/components/app/externalPlayback/ExternalConnectionSetup';
const status = vi.hoisted(() => vi.fn());
vi.mock('@/services/onlineMusic/omni', () => ({ omni: { getExternalPlaybackConnectionStatus: status } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;
async function mount() {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.body.appendChild(document.createElement('div')); root = createRoot(host);
    await act(async () => root.render(React.createElement(ExternalConnectionSetup, { providerId: 'spotify', onConfigured: () => {} })));
}
afterEach(() => { act(() => root.unmount()); host.remove(); status.mockReset(); });
it('shows status failure and retries into the setup form', async () => {
    status.mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce({ clientId: '', configured: false, redirectUri: 'http://127.0.0.1/callback', encryptionAvailable: true });
    await mount();
    expect(host.querySelector('[role=alert]')?.textContent).toContain('Offline');
    expect(host.querySelector('form')).toBeNull();
    await act(async () => host.querySelector('button')!.click());
    expect(status).toHaveBeenCalledTimes(2);
    expect(host.querySelector('input')).not.toBeNull();
    expect(host.querySelector('[role=alert]')).toBeNull();
});
it('renders no setup form for a provider with no external configuration', async () => {
    status.mockResolvedValue(null); await mount(); expect(host.textContent).toBe('');
});
