import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ExternalPlaybackConnectionStatus, OnlineProviderId } from '../../../types/onlineMusic';
import { omni } from '../../../services/onlineMusic/omni';

// The source's public app identifier is configured once before the existing browser sign-in begins.
export function ExternalConnectionSetup({ providerId, onConfigured }: { providerId: OnlineProviderId | null; onConfigured(): void }) {
    const { t } = useTranslation();
    const inputId = useId();
    const [status, setStatus] = useState<ExternalPlaybackConnectionStatus | null>(null);
    const [clientId, setClientId] = useState('');
    const [retry, setRetry] = useState(0);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        let active = true;
        setStatus(null); setError('');
        if (providerId) void omni.getExternalPlaybackConnectionStatus(providerId).then(value => {
            if (active) { setStatus(value); setClientId(value?.clientId || ''); }
        }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
        return () => { active = false; };
    }, [providerId, retry]);
    if (!providerId) return null;
    if (!status) return error ? <div className="mx-6 mb-6 text-sm">
        <p role="alert" className="mb-3 text-[color:var(--st-err)]">{t('home.externalStatusFailed')} {error}</p>
        <button type="button" className="min-h-11 rounded-xl bg-[var(--st-fill)] px-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--st-accent)]" onClick={() => setRetry(value => value + 1)}>{t('ui.retry')}</button>
    </div> : null;
    return <form className="mx-6 mb-6 rounded-2xl border border-[var(--st-line2)] bg-[var(--st-fill)] p-5 text-sm" onSubmit={event => {
        event.preventDefault(); setBusy(true); setError('');
        void omni.configureExternalPlayback(providerId, { clientId: clientId.trim() }).then(() => {
            setStatus(previous => previous ? { ...previous, configured: true } : null); onConfigured();
        }).catch(reason => setError(reason instanceof Error ? reason.message : String(reason))).finally(() => setBusy(false));
    }}>
        <label htmlFor={inputId} className="mb-2 block font-medium">{t('home.externalClientId')}</label>
        <p className="mb-3 leading-relaxed opacity-70">{t('home.externalClientSetup')}</p>
        {status.setupUrl && <a className="mb-3 inline-block underline underline-offset-4" href={status.setupUrl} target="_blank" rel="noreferrer">{t('home.externalDeveloperDashboard')}</a>}
        <p className="mb-3 break-all text-xs opacity-70">{t('home.externalRedirectUri')} <code>{status.redirectUri}</code></p>
        <div className="flex gap-3">
            <input id={inputId} value={clientId} onChange={event => setClientId(event.target.value)} autoComplete="off" spellCheck={false} maxLength={32} required pattern="[A-Za-z0-9]{32}" className="min-w-0 flex-1 rounded-xl border border-[var(--st-line2)] bg-[var(--st-card)] px-3 py-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--st-accent)]" />
            <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-[var(--st-accent)] px-4 font-medium text-[color:var(--st-on-accent)] disabled:opacity-50">{t('home.externalSaveConnect')}</button>
        </div>
        {!status.encryptionAvailable && <p role="status" className="mt-3 text-[color:var(--st-warn)]">{t('home.externalKeychainUnavailable')}</p>}
        {error && <p role="alert" className="mt-3 text-[color:var(--st-err)]">{error}</p>}
    </form>;
}
