export type ExternalQueueStatus = 'loading' | 'ready' | 'setup' | 'connect' | 'reconnect' | 'mismatch' | 'no-current' | 'rate-limited' | 'unsupported' | 'denied' | 'unavailable';

export const EXTERNAL_QUEUE_COPY: Record<ExternalQueueStatus, { key: string; fallback: string; actionKey?: string; intent?: 'sign-in' }> = {
    loading: { key: 'queue.externalLoading', fallback: 'Reading your current {{provider}} queue…' },
    ready: { key: 'queue.externalEmpty', fallback: 'Nothing queued after this track.' },
    setup: { key: 'queue.externalSetup', fallback: 'Set up the {{provider}} connection to load your queue.', actionKey: 'queue.externalSetupAction', intent: 'sign-in' },
    connect: { key: 'queue.externalConnect', fallback: 'Connect your {{provider}} account to load its current queue.', actionKey: 'queue.externalConnectAction', intent: 'sign-in' },
    reconnect: { key: 'queue.externalReconnect', fallback: 'Reconnect {{provider}} to review queue access.', actionKey: 'queue.externalReconnectAction', intent: 'sign-in' },
    mismatch: { key: 'queue.externalMismatch', fallback: 'Waiting for {{provider}}’s queue to match this track. Check the active account and device.', actionKey: 'queue.externalAccount' },
    'no-current': { key: 'queue.externalNoCurrent', fallback: '{{provider}} did not identify the current track. Check the active account and device.' },
    'rate-limited': { key: 'queue.externalRateLimited', fallback: '{{provider}} is limiting requests. The queue will retry shortly.' },
    unsupported: { key: 'queue.externalUnsupported', fallback: 'This {{provider}} queue has unsupported content.' },
    denied: { key: 'queue.externalDenied', fallback: '{{provider}} has not granted queue access.', actionKey: 'queue.externalReconnectAction', intent: 'sign-in' },
    unavailable: { key: 'queue.externalUnavailable', fallback: '{{provider}} queue is unavailable. Try again shortly.' },
};

export const externalQueueMessage = (status: ExternalQueueStatus, provider: string, translate?: (key: string, options?: { provider: string }) => string): string => {
    const copy = EXTERNAL_QUEUE_COPY[status];
    const translated = translate?.(copy.key, { provider });
    return (translated && translated !== copy.key ? translated : copy.fallback).replaceAll('{{provider}}', provider);
};
