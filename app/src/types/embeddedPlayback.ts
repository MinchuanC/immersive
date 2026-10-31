import type { ProviderErrorCode } from './onlineMusic';

export type EmbeddedPlaybackBridgeResult =
    | { ok: true; data: unknown }
    | { ok: false; error: { code: ProviderErrorCode; message: string; reason?: string; httpStatus?: number; retryAfterMs?: number } };
