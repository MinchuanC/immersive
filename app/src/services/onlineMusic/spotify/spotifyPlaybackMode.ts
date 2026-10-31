import { create } from 'zustand';

export type SpotifyPlaybackMode = 'desktop' | 'embedded';

// Selecting a mode does not change the owner of an already playing track.
export const useSpotifyPlaybackModeStore = create<{
    active: SpotifyPlaybackMode;
    desired: SpotifyPlaybackMode;
    setDesired(mode: SpotifyPlaybackMode): void;
    setActive(mode: SpotifyPlaybackMode): void;
}>(set => ({
    active: 'desktop', desired: 'embedded',
    setDesired: desired => set({ desired }),
    setActive: active => set({ active }),
}));
