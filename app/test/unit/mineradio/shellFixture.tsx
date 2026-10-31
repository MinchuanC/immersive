import React from 'react';
import { createRoot } from 'react-dom/client';
import { motionValue } from 'framer-motion';
import { MineradioHome } from '../../../src/integrations/mineradio/MineradioHome';
import { MineradioDock } from '../../../src/integrations/mineradio/MineradioDock';
import type FloatingPlayerControls from '../../../src/components/FloatingPlayerControls';
import { PlayerState } from '../../../src/types';
import PanelHandle from '../../../src/components/panelTab/shell/PanelHandle';
import { DEFAULT_THEME } from '../../../src/services/baseThemes';
import '../../../src/index.css';

// This isolated fixture contains no player; actions and clock updates are observable by the smoke.
const fixtureWindow = window as unknown as { shellCommands: unknown[]; shellClock: ReturnType<typeof motionValue<number>> };
fixtureWindow.shellCommands = [];
fixtureWindow.shellClock = motionValue(5);
const populated = new URLSearchParams(location.search).get('populated') === 'true';
const compactOnIdle = new URLSearchParams(location.search).get('compact') === 'true';
const metadata = populated ? { title: 'Shared player fixture', artist: 'Real host metadata' } : undefined;
const collections = populated ? [{ id: 'collection-a', name: 'Local collection', trackCount: 8 }, { id: 'collection-b', name: 'Saved collection', trackCount: 24 }] : [];
const queue = populated ? [{ id: 'track-a', title: 'Shared player fixture', artist: 'Real host metadata' }, { id: 'track-b', title: 'Next actual track', artist: 'Next artist' }] : [];
const command = (value: unknown) => fixtureWindow.shellCommands.push(value);
const controls: React.ComponentProps<typeof FloatingPlayerControls> | undefined = populated ? {
    currentSong: { name: metadata!.title }, playerState: PlayerState.PAUSED, currentTime: fixtureWindow.shellClock,
    duration: 180, loopMode: 'off', currentView: 'player', audioSrc: 'fixture', canTogglePlay: true, lyrics: null, isDaylight: false,
    onSeek: value => command({ action: 'seek', value }), onTogglePlay: () => command({ action: 'playPause' }),
    onToggleLoop: () => {}, onNavigateToPlayer: () => command({ action: 'openPlayer' }), onCommitBottomBarOffset: () => {},
    slotPrimary: 'loop', slotSecondary: 'lyrics-timeline',
    slotContext: { onShuffle: () => {}, canShuffle: true, onLike: () => {}, isLiked: false, likeDisabled: false, invokeCommandById: () => {}, canInvokeCommandById: () => true },
    trackNavigation: { currentTrackKey: 'track-a', onPrev: () => command({ action: 'previous' }), onNext: () => command({ action: 'next' }), canPrev: false, canNext: true, prevTitle: null, nextTitle: 'Next actual track', prevLabel: 'Previous track', nextLabel: 'Next track' },
} : undefined;
createRoot(document.getElementById('root')!).render(<>
    <MineradioHome metadata={metadata} collections={collections} queue={queue} nextUp={queue[1] ?? null} paused externalSourceLabel="Spotify" onCommand={command} />
    <MineradioDock metadata={metadata} currentTime={fixtureWindow.shellClock} duration={populated ? 180 : 0} paused volume={0.7} compactOnIdle={compactOnIdle} controls={controls} onCommand={command} onOpenExperience={() => command({ action: 'experience' })} />
    {compactOnIdle && <PanelHandle isOpen={false} onToggle={() => command({ action: 'panel' })} theme={DEFAULT_THEME} isDaylight={false} showOpenPanelCloseButton isPanelGuideHotspotActive={false} hideToggleButton={false} isCommandPaletteOpen={false} />}
    {compactOnIdle && <button type="button" style={{ position: 'fixed', top: 12, left: 12, zIndex: 100 }} onClick={() => document.getElementById('play-btn')?.focus()}>Restore player focus</button>}
</>);
