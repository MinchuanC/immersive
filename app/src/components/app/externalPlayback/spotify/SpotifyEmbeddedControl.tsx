import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LoginState } from '../../../../types/onlineMusic';
import type { SongResult } from '../../../../types';
import { usePlaybackStore } from '../../../../stores/usePlaybackStore';
import { getOnlineProviderIdForSong } from '../../../../utils/appPlaybackGuards';
import { requestSpotifyEmbedded, type SpotifyWireLoginStart } from '../../../../services/onlineMusic/spotify/spotifyEmbeddedTransport';
import { useSpotifyPlaybackModeStore } from '../../../../services/onlineMusic/spotify/spotifyPlaybackMode';
import { stopSpotifyEmbeddedPlayback } from './spotifyPlaybackHandoff';
import { selectVerifiedExternalQueue, useExternalPlaybackStore } from '../useExternalPlaybackStore';

type EmbeddedUser = { nickname: string };
const buttonClass = 'min-h-9 rounded-lg bg-[var(--st-fill)] px-3 text-xs font-medium disabled:opacity-50';

export default function SpotifyEmbeddedControl({ onPlayCurrent }: { onPlayCurrent?: (song: SongResult, queue: SongResult[]) => void | Promise<void> }) {
    const { t } = useTranslation();
    const [user, setUser] = useState<EmbeddedUser | null>(null);
    const [loaded, setLoaded] = useState(false);
    const [busy, setBusy] = useState(false);
    const [attempt, setAttempt] = useState<string | null>(null);
    const [error, setError] = useState('');
    const mounted = useRef(true);
    const active = useSpotifyPlaybackModeStore(state => state.active);
    const desired = useSpotifyPlaybackModeStore(state => state.desired);
    const setDesired = useSpotifyPlaybackModeStore(state => state.setDesired);
    const currentSong = usePlaybackStore(state => state.currentSong);
    const context = usePlaybackStore(state => state.activePlaybackContext);
    const canRestart = Boolean(user && onPlayCurrent && active === 'desktop' && desired === 'embedded' && context === 'main' && getOnlineProviderIdForSong(currentSong) === 'spotify');

    useEffect(() => {
        mounted.current = true;
        let live = true;
        void requestSpotifyEmbedded<EmbeddedUser | null>('login_status').then(value => { if (live) setUser(value); })
            .catch(reason => { if (live) setError(reason instanceof Error ? reason.message : String(reason)); })
            .finally(() => { if (live) setLoaded(true); });
        return () => { live = false; mounted.current = false; };
    }, []);

    useEffect(() => {
        if (!attempt) return;
        let live = true;
        let timer: ReturnType<typeof setTimeout>;
        const check = async () => {
            try {
                const status = await requestSpotifyEmbedded<LoginState>('login_check', { key: attempt });
                if (!live) return;
                if (status.state === 'confirmed') {
                    const value = await requestSpotifyEmbedded<EmbeddedUser | null>('login_status');
                    if (live) { setUser(value); setAttempt(null); }
                } else if (status.state === 'expired' || status.state === 'error') {
                    setError(status.state === 'error' ? status.message || 'Spotify sign-in failed' : 'Spotify sign-in expired');
                    setAttempt(null);
                } else timer = setTimeout(check, 1500);
            } catch (reason) {
                if (live) { setError(reason instanceof Error ? reason.message : String(reason)); setAttempt(null); }
            }
        };
        void check();
        return () => { live = false; clearTimeout(timer); void requestSpotifyEmbedded('login_cancel', { key: attempt }).catch(() => {}); };
    }, [attempt]);

    const connect = async () => {
        setBusy(true); setError('');
        let key: string | null = null;
        try {
            const started = await requestSpotifyEmbedded<SpotifyWireLoginStart>('login_start');
            key = started.key;
            if (!mounted.current) { void requestSpotifyEmbedded('login_cancel', { key }).catch(() => {}); return; }
            const opened = await requestSpotifyEmbedded<boolean>('login_open', { key });
            if (!mounted.current) { void requestSpotifyEmbedded('login_cancel', { key }).catch(() => {}); return; }
            if (!opened) throw new Error('Could not open Spotify sign-in');
            setAttempt(key);
        } catch (reason) {
            if (key) void requestSpotifyEmbedded('login_cancel', { key }).catch(() => {});
            if (mounted.current) setError(reason instanceof Error ? reason.message : String(reason));
        } finally { if (mounted.current) setBusy(false); }
    };
    const disconnect = async () => {
        setBusy(true); setError('');
        try {
            if (!await stopSpotifyEmbeddedPlayback()) throw new Error(t('spotifyEmbedded.stopSuperseded', { defaultValue: 'Playback changed. Try disconnecting again.' }));
            await requestSpotifyEmbedded('logout');
            if (mounted.current) setUser(null);
        }
        catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : String(reason)); }
        finally { if (mounted.current) setBusy(false); }
    };
    const restartCurrent = async () => {
        const playback = usePlaybackStore.getState();
        const mode = useSpotifyPlaybackModeStore.getState();
        if (!user || !onPlayCurrent || busy || mode.active !== 'desktop' || mode.desired !== 'embedded' || playback.activePlaybackContext !== 'main' || !playback.currentSong || getOnlineProviderIdForSong(playback.currentSong) !== 'spotify') return;
        setBusy(true); setError('');
        const external = useExternalPlaybackStore.getState();
        const queue = external.queueStatus === 'ready' ? selectVerifiedExternalQueue(playback.currentSong, external.queue) : [];
        try { await onPlayCurrent(playback.currentSong, queue.length ? queue : [playback.currentSong]); }
        catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : String(reason)); }
        finally { if (mounted.current) setBusy(false); }
    };
    if (!window.electron?.embeddedPlaybackRequest) return null;
    return <section className="space-y-2 rounded-xl bg-[var(--st-card)] p-3 text-sm" aria-label={t('spotifyEmbedded.title', { defaultValue: 'Immersive Spotify playback' })}>
        <p className="font-semibold">{t('spotifyEmbedded.title', { defaultValue: 'Immersive Spotify playback' })}</p>
        <p className="text-xs leading-relaxed text-[var(--st-t2)]">{t('spotifyEmbedded.notice', { defaultValue: "This unofficial connection needs a separate sign-in. It may violate Spotify's terms and affect your account access; Spotify permission has not been established." })}</p>
        {user && <p className="text-xs text-[var(--st-t2)]">{t('spotifyEmbedded.signedInAs', { name: user.nickname, defaultValue: 'Immersive audio account: {{name}}' })}</p>}
        {user && <p className="text-xs text-[var(--st-t2)]">{t('spotifyEmbedded.accountNotice', { defaultValue: 'We cannot confirm this matches your library account; use the same Spotify account for both.' })}</p>}
        {user && <p className="text-xs text-[var(--st-t2)]">{t('spotifyEmbedded.queueNotice', { defaultValue: 'Immersive playback uses this app’s queue, not the Spotify Desktop queue.' })}</p>}
        <div className="flex flex-wrap gap-2">
            {!user && <button type="button" className={buttonClass} disabled={!loaded || busy || !!attempt} onClick={() => void connect()}>{t('spotifyEmbedded.connect', { defaultValue: 'Connect immersive audio' })}</button>}
            {attempt && <button type="button" className={buttonClass} onClick={() => setAttempt(null)}>{t('spotifyEmbedded.cancel', { defaultValue: 'Cancel sign-in' })}</button>}
            {user && <button type="button" className={buttonClass} disabled={busy || desired === 'embedded'} onClick={() => setDesired('embedded')}>{t('spotifyEmbedded.useEmbedded', { defaultValue: 'Use immersive playback' })}</button>}
            <button type="button" className={buttonClass} disabled={busy || desired === 'desktop'} onClick={() => setDesired('desktop')}>{t('spotifyEmbedded.useDesktop', { defaultValue: 'Use Spotify Desktop' })}</button>
            {user && <button type="button" className={buttonClass} disabled={busy} onClick={() => void disconnect()}>{t('spotifyEmbedded.disconnect', { defaultValue: 'Disconnect immersive audio' })}</button>}
        </div>
        {attempt && <p role="status" className="text-xs">{t('spotifyEmbedded.waiting', { defaultValue: 'Complete sign-in in your browser.' })}</p>}
        {desired !== active && <p role="status" className="text-xs">{t('spotifyEmbedded.pending', { defaultValue: 'The change applies when you select the next Spotify track in this app.' })}</p>}
        {canRestart && <><p className="text-xs text-[var(--st-t2)]">{t('spotifyEmbedded.restartNotice', { defaultValue: 'Restarts this track from the beginning using your verified Spotify queue, or only this track if the queue is unavailable.' })}</p><button type="button" className={buttonClass} disabled={busy} onClick={() => void restartCurrent()}>{t('spotifyEmbedded.restartCurrent', { defaultValue: 'Restart current track with immersive playback' })}</button></>}
        {error && <p role="alert" className="text-xs text-[var(--st-err)]">{error}</p>}
    </section>;
}
