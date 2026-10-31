import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    clearConsoleLog,
    formatConsoleLog,
    getConsoleLogEntries,
    installConsoleLogCapture,
    isConsoleCaptureEnabled,
    recordMainProcessLines,
    setConsoleCaptureEnabled,
    setConsoleLogSink,
    subscribeToConsoleLog,
} from '../../../src/utils/consoleLogBuffer';

const { redactCredentials: redactMainCredentials } = require('../../../electron/debug/redactCredentials.cjs');

// The suite runs on the node environment. Capture also listens for uncaught errors on `window`,
// which is not what is under test here, so a stub is enough to let the install run.
(globalThis as unknown as { window: { addEventListener: () => void } }).window = { addEventListener: () => {} };
// The module patches console once per process and never unpatches, which is what the app wants
// and what makes this file order-independent: installing again is a no-op.
installConsoleLogCapture();

describe('consoleLogBuffer scopes', () => {
    beforeEach(() => {
        clearConsoleLog();
    });

    it('reads the [Module] prefix the app already writes', () => {
        console.log('[Automix] blending 7.68s - bassSwap');
        console.warn('[KugouProvider] login-status:error');

        expect(getConsoleLogEntries().map(entry => entry.scope)).toEqual(['Automix', 'KugouProvider']);
    });

    it('leaves the prefix in the text, so a copied log keeps its familiar shape', () => {
        console.log('[Prefetch] Audio already cached for: Starry Eyes');

        expect(getConsoleLogEntries()[0].text).toBe('[Prefetch] Audio already cached for: Starry Eyes');
    });

    it('has no scope for a line that never announced one', () => {
        console.log('Restoring last song');
        // A bracket that is not a prefix must not be mistaken for one.
        console.log('finished [after] a while');
        // Nor one with a space in it, which is prose rather than a tag.
        console.log('[not a tag] something');

        expect(getConsoleLogEntries().map(entry => entry.scope)).toEqual([null, null, null]);
    });

    it('formats only the lines it is given, which is how a selection gets copied', () => {
        console.log('[A] first');
        console.log('[B] second');
        console.log('[A] third');

        const onlyA = getConsoleLogEntries().filter(entry => entry.scope === 'A');
        const text = formatConsoleLog(onlyA);

        expect(text.split('\n')).toHaveLength(2);
        expect(text).toContain('[A] first');
        expect(text).toContain('[A] third');
        expect(text).not.toContain('second');
    });

    it('keeps the name and message of errors nested in logged objects', () => {
        console.warn('[App] output failed', { error: new DOMException('Requested device not found', 'NotFoundError') });

        expect(getConsoleLogEntries()[0].text).toBe('[App] output failed {"error":"NotFoundError: Requested device not found"}');
    });

    it.each([
        ['GET /track?cookie=session%3Dcookie-secret&id=7', 'GET /track?cookie=<redacted>&id=7'],
        ['Cookie: session=cookie-secret; path=/', 'Cookie: <redacted>'],
        ['{"cookie":"session=cookie-secret","status":401}', '{"cookie":"<redacted>","status":401}'],
        ['Authorization: Bearer bearer-secret', 'Authorization: <redacted>'],
        ['{"Authorization":"Bearer bearer-secret","status":401}', '{"Authorization":"<redacted>","status":401}'],
        ['request failed Bearer bearer-secret', 'request failed Bearer <redacted>'],
        ['/token?access_token=access-secret&refresh_token=refresh-secret&client_secret=client-secret&id=7', '/token?access_token=<redacted>&refresh_token=<redacted>&client_secret=<redacted>&id=7'],
        ['{"access_token":"access-secret","refresh_token":"refresh-secret","client_secret":"client-secret"}', '{"access_token":"<redacted>","refresh_token":"<redacted>","client_secret":"<redacted>"}'],
        ['{"hasLoginCookie":true,"tokenType":"Bearer","status":401}', '{"hasLoginCookie":true,"tokenType":"Bearer","status":401}'],
    ])('redacts captured credential values before the buffer and sink: %s', (line, expected) => {
        const sink = vi.fn();
        setConsoleLogSink(sink);
        try {
            console.log(line);
            expect(getConsoleLogEntries()[0].text).toBe(expected);
            expect(sink.mock.calls[0][0].text).toBe(expected);
            expect(formatConsoleLog()).toContain(expected);
            // The two runtime boundaries must agree even though the browser cannot import CJS.
            expect(redactMainCredentials(line)).toBe(expected);
        } finally {
            setConsoleLogSink(null);
        }
    });
});

describe('console capture switch', () => {
    beforeEach(() => {
        setConsoleCaptureEnabled(true);
        clearConsoleLog();
    });

    it('records by default - a log that has to be switched on first is never there when needed', () => {
        expect(isConsoleCaptureEnabled()).toBe(true);
    });

    it('stops recording, and drops what it was holding', () => {
        console.log('[A] before');
        expect(getConsoleLogEntries()).toHaveLength(1);

        setConsoleCaptureEnabled(false);
        expect(getConsoleLogEntries()).toHaveLength(0);

        console.log('[A] after');
        expect(getConsoleLogEntries()).toHaveLength(0);
    });

    it('records again once switched back on', () => {
        setConsoleCaptureEnabled(false);
        console.log('[A] ignored');
        setConsoleCaptureEnabled(true);
        console.log('[A] kept');

        expect(getConsoleLogEntries().map(entry => entry.text)).toEqual(['[A] kept']);
    });
});

describe('lines from the main process', () => {
    beforeEach(() => {
        setConsoleCaptureEnabled(true);
        clearConsoleLog();
    });

    it('joins the buffer in the order the lines were written, with the module read off each', () => {
        console.log('[Page] now');
        const own = getConsoleLogEntries()[0];
        recordMainProcessLines([
            { at: own.at - 20, level: 'log', text: '[Ytm] before the window existed' },
            { at: own.at + 5, level: 'warn', text: 'no prefix' },
        ]);
        expect(getConsoleLogEntries().map(entry => [entry.text, entry.scope, entry.level])).toEqual([
            ['[Ytm] before the window existed', 'Ytm', 'log'],
            ['[Page] now', 'Page', 'log'],
            ['no prefix', null, 'warn'],
        ]);
        expect(new Set(getConsoleLogEntries().map(entry => entry.id)).size).toBe(3);
    });

    it('is not sent back to the file the main process already wrote it to, and tells the panel once per batch', () => {
        const sink = vi.fn();
        const listener = vi.fn();
        setConsoleLogSink(sink);
        const stop = subscribeToConsoleLog(listener);
        recordMainProcessLines([{ at: 1, level: 'log', text: '[Ytm] a' }, { at: 2, level: 'log', text: '[Ytm] b' }]);
        recordMainProcessLines([]);
        stop();
        setConsoleLogSink(null);
        expect(sink).not.toHaveBeenCalled();
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('redacts main-process lines before retaining or copying them', () => {
        recordMainProcessLines([{ at: 1, level: 'warn', text: '[Spotify] access_token=main-secret' }]);
        expect(getConsoleLogEntries()[0].text).toBe('[Spotify] access_token=<redacted>');
        expect(formatConsoleLog()).not.toContain('main-secret');
    });

    it('keeps the newest lines when the buffer is full, and nothing while recording is off', () => {
        recordMainProcessLines(Array.from({ length: 1001 }, (_item, index) => ({ at: index, level: 'log' as const, text: `line ${index}` })));
        expect(getConsoleLogEntries()).toHaveLength(1000);
        expect(getConsoleLogEntries()[0].text).toBe('line 1');
        setConsoleCaptureEnabled(false);
        recordMainProcessLines([{ at: 5000, level: 'log', text: 'ignored' }]);
        expect(getConsoleLogEntries()).toHaveLength(0);
    });
});
