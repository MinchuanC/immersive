// Presentation code belongs to the main window, not the provider registry used by other windows.
const presentations = import.meta.glob<{ registerPlaybackPresentation(): void }>('./*/playbackPresentation.ts', { eager: true });
Object.values(presentations).forEach(presentation => presentation.registerPlaybackPresentation());
