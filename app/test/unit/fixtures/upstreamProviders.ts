import { vi } from 'vitest';
import { registerOnlineMusicProvider, unregisterOnlineMusicProvider } from '@/services/onlineMusic/providerRegistry';
import { neteaseProvider } from '@/services/onlineMusic/netease/neteaseProvider';
import { kugouProvider } from '@/services/onlineMusic/kugou/kugouProvider';
import { qqProvider } from '@/services/onlineMusic/qq/qqProvider';
import { bodianProvider } from '@/services/onlineMusic/bodian/bodianProvider';
import { ytmProvider } from '@/services/onlineMusic/ytm/ytmProvider';
import { spotifyProvider } from '@/services/onlineMusic/spotify/spotifyProvider';
import { qishuiProvider } from '@/services/onlineMusic/qishui/qishuiProvider';
import { useOnlineProviderAccountStore } from '@/stores/useOnlineProviderAccountStore';

// Copied adapter tests exercise their original registry and ordering explicitly.
const upstreamProviders = [neteaseProvider, kugouProvider, qqProvider, bodianProvider, ytmProvider, spotifyProvider, qishuiProvider];
for (const provider of upstreamProviders) unregisterOnlineMusicProvider(provider.id);
for (const provider of upstreamProviders) registerOnlineMusicProvider(provider);
useOnlineProviderAccountStore.getState().setActiveProviderId('netease');

// Upstream matching fixtures never reach the live lyric service.
vi.mock('@/services/lyrics/lrclib', () => ({ lookupLrclib: async () => ({ kind: 'unavailable' }), lrclibLyrics: () => null }));
