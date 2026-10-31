import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readStoredSubtitleContentMode, readStoredSubtitleOverlayLayout, SHOW_SUBTITLE_TRANSLATION_STORAGE_KEY, SUBTITLE_CONTENT_MODE_STORAGE_KEY, SUBTITLE_OVERLAY_LAYOUT_STORAGE_KEY } from '@/stores/useTypographySettingsStore';

// test/unit/stores/subtitleContentMode.test.ts
// Locks the one-time compatibility mapping from the former translation visibility boolean.

describe('stored subtitle content mode', () => {
    let values: Map<string, string>;

    beforeEach(() => {
        values = new Map();
        const storage = {
            getItem: (key: string) => values.get(key) ?? null,
            setItem: (key: string, value: string) => values.set(key, value),
        };
        vi.stubGlobal('localStorage', storage);
        vi.stubGlobal('window', { localStorage: storage });
    });

    afterEach(() => vi.unstubAllGlobals());

    it('defaults to translation and migrates the legacy hidden state to none', () => {
        expect(readStoredSubtitleContentMode()).toBe('translation');

        localStorage.setItem(SHOW_SUBTITLE_TRANSLATION_STORAGE_KEY, 'false');
        expect(readStoredSubtitleContentMode()).toBe('none');
    });

    it('prefers an explicit modern mode over the legacy boolean', () => {
        localStorage.setItem(SHOW_SUBTITLE_TRANSLATION_STORAGE_KEY, 'false');
        localStorage.setItem(SUBTITLE_CONTENT_MODE_STORAGE_KEY, 'romanization');

        expect(readStoredSubtitleContentMode()).toBe('romanization');
    });

    it('reads the dual-row mode back', () => {
        localStorage.setItem(SUBTITLE_CONTENT_MODE_STORAGE_KEY, 'both');

        expect(readStoredSubtitleContentMode()).toBe('both');
    });

    it('migrates content mode once and keeps the stored layout separate afterwards', () => {
        localStorage.setItem(SUBTITLE_CONTENT_MODE_STORAGE_KEY, 'both');

        expect(readStoredSubtitleOverlayLayout()).toBe('current+romanization+translation');
        expect(localStorage.getItem(SUBTITLE_OVERLAY_LAYOUT_STORAGE_KEY)).toBe('current+romanization+translation');

        localStorage.setItem(SUBTITLE_CONTENT_MODE_STORAGE_KEY, 'none');
        expect(readStoredSubtitleOverlayLayout()).toBe('current+romanization+translation');
        expect(readStoredSubtitleContentMode()).toBe('none');
    });

    it('keeps a valid saved layout and repairs invalid values from the legacy setting', () => {
        localStorage.setItem(SUBTITLE_CONTENT_MODE_STORAGE_KEY, 'romanization');
        localStorage.setItem(SUBTITLE_OVERLAY_LAYOUT_STORAGE_KEY, 'current+next');
        expect(readStoredSubtitleOverlayLayout()).toBe('current+next');

        localStorage.setItem(SUBTITLE_OVERLAY_LAYOUT_STORAGE_KEY, 'next');
        expect(readStoredSubtitleOverlayLayout()).toBe('romanization');
        expect(localStorage.getItem(SUBTITLE_OVERLAY_LAYOUT_STORAGE_KEY)).toBe('romanization');
    });

});
