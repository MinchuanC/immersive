// src/components/modal/userGuideContent.ts

export const USER_GUIDE_AUTO_OPEN_VERSION: string | null = '0.7.22';

export type HelpTabShortcut = {
    id: string;
    titleKey: string;
    fallback: string;
    /** Rendered after the primary modifier, which the Help tab prints per platform. */
    key: string;
};

// The primary-modifier entry points, shown at the top of the settings Help tab. Every one of
// these is claimed in the command palette registry, so the two must be changed together.
export const HELP_TAB_PRIMARY_SHORTCUTS: HelpTabShortcut[] = [
    { id: 'quick-actions', titleKey: 'help.quickActions', fallback: 'Quick actions', key: 'K' },
    { id: 'queue-collage', titleKey: 'help.queueCollage', fallback: 'Queue collage', key: 'B' },
    { id: 'play-queue', titleKey: 'help.playQueue', fallback: 'Play queue', key: 'P' },
];

export type HelpTabPlayerControl = {
    id: string;
    /** One action, or the two a row pairs: the Help tab joins their names with a slash. */
    titleKeys: string[];
    /** Held with the primary modifier, which the Help tab prints per platform. */
    withPrimaryModifier?: boolean;
    /** One key for each action. */
    keys: string[];
};

// What the keyboard does on the player page, shown beside the entry points above.
export const HELP_TAB_PLAYER_CONTROLS: HelpTabPlayerControl[] = [
    { id: 'play-pause', titleKeys: ['help.playPause'], keys: ['Space'] },
    { id: 'previous-next-track', titleKeys: ['help.previousTrack', 'help.nextTrack'], withPrimaryModifier: true, keys: ['←', '→'] },
    { id: 'seek', titleKeys: ['help.seekBackward', 'help.seekForward'], keys: ['←', '→'] },
];
