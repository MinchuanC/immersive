import React, { useId } from 'react';
import { Album, Bookmark, Check, Music2, Play, Sparkles, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Theme } from '../../../types';
import type { EditionCue } from '../../../types/immersion';
import { isRecipe } from '../../../services/immersion/personalEditions';
import { Select } from '../../modal/settings/kit/Select';
import { SettingsKitThemeContext } from '../../modal/settings/kit/kitTheme';
import Sheet, { SheetButton } from '../../shared/Sheet';
import type { ImmersionModel } from './useImmersion';

type Props = { model: ImmersionModel; isDaylight?: boolean; theme?: Theme };

const isCue = (value: unknown): value is EditionCue => {
    if (!value || typeof value !== 'object') return false;
    const cue = value as EditionCue;
    return typeof cue.id === 'string' && !!cue.id.trim()
        && typeof cue.trackKey === 'string' && !!cue.trackKey.trim()
        && typeof cue.label === 'string' && Number.isFinite(cue.atSec) && cue.atSec >= 0
        && (cue.kind === 'look' || cue.kind === 'bookmark');
};
const position = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

const ImmersionPanel: React.FC<Props> = ({ model, isDaylight = false, theme }) => {
    const { t } = useTranslation();
    const labelId = useId();
    const edition = model.edition;
    const cues = Array.isArray(edition?.cues) ? edition.cues.filter(isCue) : [];
    const incompatible = !!edition && (edition.version !== 1 || edition.scoreVersion !== 1
        || !Array.isArray(edition.cues) || cues.length !== edition.cues.length);
    const unsupportedRecipe = cues.some(cue => cue.kind === 'look' && !isRecipe(cue.recipe));
    const canSave = model.local && !!model.currentAlbum && !model.busy && !incompatible;
    const journey = model.journey;
    const status = model.error ? t('immersion.error') : model.busy ? t('immersion.busy') : model.saved ? t('immersion.saved') : '';
    const sectionClass = 'rounded-2xl bg-[var(--st-card)] p-5';
    const detailClass = 'text-sm leading-relaxed text-[var(--st-t2)]';
    const actionsClass = 'flex flex-wrap items-center gap-2';

    return (
        <SettingsKitThemeContext.Provider value={{ isDaylight, theme }}>
            <Sheet isOpen={model.isOpen} onClose={() => model.setOpen(false)} size="l" isDaylight={isDaylight}
                title={t('immersion.title')} subtitle={t('immersion.subtitle')}
                footerNote={<span role="status" aria-live="polite" className={model.error ? 'text-[var(--st-err)]' : ''}>{status}</span>}
                footer={<SheetButton onClick={() => model.setOpen(false)}>{t('immersion.done')}</SheetButton>}>
                <div className="flex flex-col gap-4">
                    {!model.scoreSupported && !model.local && <p className="rounded-xl bg-[var(--st-fill)] px-4 py-3 text-sm leading-relaxed text-[var(--st-t2)]">{t('immersion.localGuidance')}</p>}

                    <section className={sectionClass} aria-labelledby={`${labelId}-score`}>
                        <div className="mb-3 flex items-center gap-3">
                            <Music2 size={20} aria-hidden="true" className="shrink-0 text-[var(--st-accent)]" />
                            <h2 id={`${labelId}-score`} className="text-base font-semibold">{t('immersion.scoreTitle')}</h2>
                            {model.scoreSupported && model.scoreEnabled && model.score && <span className="ml-auto text-xs text-[var(--st-ok)]">{t('immersion.active')}</span>}
                        </div>
                        <p className={detailClass}>{t('immersion.scoreDescription')}</p>
                        <p className="mt-3 truncate text-sm font-medium">{model.song?.name ?? t('immersion.noTrack')}</p>
                        <p className={`${detailClass} mt-1 min-h-5`} role="status" aria-live="polite">
                            {!model.scoreSupported ? t('immersion.analysisUnsupported') : model.scoreWaiting ? t('immersion.analysisWaiting') : model.analyzing ? t('immersion.analysisPending') : model.score
                                ? t('immersion.analysisComplete', { count: model.score.cues.length })
                                : model.scoreEnabled ? t('immersion.analysisUnavailable') : t('immersion.analysisReady')}
                        </p>
                        <div className={`${actionsClass} mt-4`}>
                            <SheetButton variant="primary" disabled={!model.scoreSupported || model.busy || model.scoreEnabled} onClick={model.startScore}>
                                <Play size={14} aria-hidden="true" />{t('immersion.startScore')}
                            </SheetButton>
                            <SheetButton disabled={!model.scoreEnabled && !model.editionEnabled} onClick={model.stopVisuals}>
                                <Square size={14} aria-hidden="true" />{t('immersion.stopVisuals')}
                            </SheetButton>
                        </div>
                    </section>

                    <section className={sectionClass} aria-labelledby={`${labelId}-lyrics`}>
                        <div className="mb-3 flex items-center gap-3">
                            <Music2 size={20} aria-hidden="true" className="shrink-0 text-[var(--st-accent)]" />
                            <h2 id={`${labelId}-lyrics`} className="text-base font-semibold">{t('immersion.lyricsTitle')}</h2>
                        </div>
                        <p className={detailClass}>{t('immersion.lyricsDescription')}</p>
                        <div className={`${actionsClass} mt-4`}>
                            <SheetButton onClick={model.openImmersiveLyrics}>{t('immersion.openImmersiveLyrics')}</SheetButton>
                        </div>
                    </section>

                    <section className={sectionClass} aria-labelledby={`${labelId}-editions`}>
                        <div className="mb-3 flex items-center gap-3">
                            <Sparkles size={20} aria-hidden="true" className="shrink-0 text-[var(--st-accent)]" />
                            <h2 id={`${labelId}-editions`} className="text-base font-semibold">{t('immersion.editionsTitle')}</h2>
                            {model.local && model.editionEnabled && !incompatible && !unsupportedRecipe && cues.some(cue => cue.kind === 'look') && <span className="ml-auto text-xs text-[var(--st-ok)]">{t('immersion.active')}</span>}
                        </div>
                        <p className={detailClass}>{t('immersion.editionsDescription')}</p>
                        <p className={`${detailClass} mt-2`}>{model.local ? model.currentAlbum?.name ?? t('immersion.albumNeeded') : t('immersion.editionsLocalOnly')}</p>
                        {incompatible && <p className="mt-3 text-sm text-[var(--st-warn)]">{t('immersion.incompatible')}</p>}
                        {!incompatible && unsupportedRecipe && <p className="mt-3 text-sm text-[var(--st-warn)]">{t('immersion.unsupportedRecipe')}</p>}
                        <label htmlFor={labelId} className="mb-2 mt-4 block text-xs font-medium text-[var(--st-t2)]">{t('immersion.cueLabel')}</label>
                        <input id={labelId} value={model.label} onChange={event => model.setLabel(event.target.value)} disabled={!canSave}
                            placeholder={t('immersion.cuePlaceholder')}
                            className="h-10 w-full rounded-lg border border-[var(--st-line2)] bg-[var(--st-fill)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--st-accent)] disabled:opacity-40" />
                        <div className={`${actionsClass} mt-3`}>
                            <SheetButton disabled={!canSave || !model.canKeepLook} onClick={() => void model.save('look')}><Check size={14} aria-hidden="true" />{t('immersion.keepLook')}</SheetButton>
                            <SheetButton disabled={!canSave || !model.canKeepLook} onClick={() => void model.save('look', -.15)}>{t('immersion.less')}</SheetButton>
                            <SheetButton disabled={!canSave || !model.canKeepLook} onClick={() => void model.save('look', .15)}>{t('immersion.more')}</SheetButton>
                            <SheetButton disabled={!canSave} onClick={() => void model.save('bookmark')}><Bookmark size={14} aria-hidden="true" />{t('immersion.rememberPassage')}</SheetButton>
                            <SheetButton disabled={!model.local || model.busy || incompatible || unsupportedRecipe || !cues.some(cue => cue.kind === 'look')} onClick={model.useEdition}>{t('immersion.useEdition')}</SheetButton>
                        </div>
                        <div className="mt-4 border-t border-[var(--st-line)] pt-3">
                            <h3 className="mb-2 text-xs font-medium text-[var(--st-t2)]">{t('immersion.savedCues')}</h3>
                            {!cues.length ? <p className={detailClass}>{t('immersion.noCues')}</p> : (
                                <ul className="flex flex-col divide-y divide-[var(--st-line)]">
                                    {cues.map((cue, index) => <li key={`${cue.id}-${index}`} className="flex flex-wrap items-center gap-3 py-3">
                                        <span className="w-10 shrink-0 text-xs tabular-nums text-[var(--st-t2)]">{position(cue.atSec)}</span>
                                        <div className="min-w-0 flex-1 basis-40">
                                            <p className="break-words text-sm">{cue.label || t('immersion.untitledCue')}</p>
                                            <p className="mt-0.5 text-xs text-[var(--st-t3)]">{t(cue.kind === 'look' ? 'immersion.look' : 'immersion.bookmark')}</p>
                                        </div>
                                        <div className={actionsClass}>
                                            <SheetButton disabled={model.busy || incompatible || (cue.kind === 'look' && !isRecipe(cue.recipe))} aria-label={t('immersion.replayCue', { label: cue.label })} onClick={() => void model.replay(cue)}>{t('immersion.replay')}</SheetButton>
                                            <SheetButton disabled={model.busy || incompatible} aria-label={t('immersion.removeCue', { label: cue.label })} onClick={() => void model.removeCue(cue.id)}>{t('immersion.remove')}</SheetButton>
                                        </div>
                                    </li>)}
                                </ul>
                            )}
                        </div>
                    </section>

                    <section className={sectionClass} aria-labelledby={`${labelId}-journeys`}>
                        <div className="mb-3 flex items-center gap-3">
                            <Album size={20} aria-hidden="true" className="shrink-0 text-[var(--st-accent)]" />
                            <h2 id={`${labelId}-journeys`} className="text-base font-semibold">{t('immersion.journeysTitle')}</h2>
                        </div>
                        <p className={detailClass}>{t('immersion.journeysDescription')}</p>
                        {model.onlineAlbumLoading && <p className={`${detailClass} mt-3`} role="status">{t('immersion.onlineAlbumLoading')}</p>}
                        {model.onlineAlbumError && <p className={`${detailClass} mt-3`} role="status">{t('immersion.onlineAlbumUnavailable')}</p>}
                        {model.albums.length ? <>
                            <p className="mb-2 mt-4 text-xs font-medium text-[var(--st-t2)]">{t('immersion.chooseAlbum')}</p>
                            <Select
                                name={t('immersion.chooseAlbum')}
                                value={model.selectedAlbum?.key ?? ''}
                                options={model.albums.map(album => ({
                                    value: album.key,
                                    label: `${album.name} · ${t('immersion.trackCount', { count: album.tracks.length })}`,
                                }))}
                                onChange={model.setSelectedAlbumKey}
                                disabled={model.busy}
                            />
                        </> : <p className={`${detailClass} mt-3`}>{t('immersion.noAlbums')}</p>}
                        {journey && <p className="mt-3 text-sm leading-relaxed" role="status" aria-live="polite">
                            {journey.state === 'completed' ? t('immersion.journeyCompleted', { album: journey.albumName })
                                : journey.state === 'interrupted' ? t('immersion.journeyInterrupted', { album: journey.albumName })
                                    : t('immersion.journeyProgress', { album: journey.albumName, chapter: Math.max(1, journey.index + 1), count: journey.trackKeys.length })}
                        </p>}
                        <div className={`${actionsClass} mt-4`}>
                            <SheetButton variant="primary" disabled={model.busy || !model.selectedAlbum || journey?.state === 'running' || (model.onlineAlbumLoading && model.selectedAlbum.key === model.onlineAlbumKey)} onClick={() => void model.startJourney()}><Play size={14} aria-hidden="true" />{t('immersion.startJourney')}</SheetButton>
                            {journey?.state === 'interrupted' && <SheetButton disabled={model.busy || !model.albums.some(album => album.key === journey.albumKey)} onClick={model.resumeJourney}>{t('immersion.resumeJourney')}</SheetButton>}
                            {journey && <SheetButton onClick={model.leaveJourney}>{t('immersion.leaveJourney')}</SheetButton>}
                        </div>
                    </section>
                </div>
            </Sheet>
        </SettingsKitThemeContext.Provider>
    );
};

export default ImmersionPanel;
