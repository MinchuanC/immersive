import React, { useCallback, useMemo, useRef } from 'react';
import { MineradioStage } from '../../../../integrations/mineradio/MineradioStage';
import { useMineradioHost } from '../../../../integrations/mineradio/MineradioHost';
import type { StageCommand } from '../../../../integrations/mineradio/stageBridge';
import { selectDisplaySong, usePlaybackStore } from '../../../../stores/usePlaybackStore';
import { useLowPowerRenderHold } from '../../../app/backgroundThrottling/useLowPowerRenderHold';
import { useDesktopSettingsStore } from '../../../../stores/useDesktopSettingsStore';
import { useVisualizerSettingsStore } from '../../../../stores/useVisualizerSettingsStore';
import * as signals from '../../../../stores/motionSignals';
import type { VisualizerBackgroundRenderProps } from '../definition';
import { useFirstFrameDrawn } from '../../styleTransition/firstFrame';
import type { VisualizerSharedProps } from '../../definition';
import i18n from '../../../../i18n/config';
import { isMainAppSurface } from '../../../../utils/appSurface';
import { createMusicResponse } from '../../../../integrations/mineradio/musicResponse';
import { BEAT_EFFECT_IDS } from '../../../../services/beatFx/beatEffects';
import { getBeatListImpact } from '../../../../services/beatFx/beatFxLive';
import { getPlaybackSongKey } from '../../../../utils/appPlaybackGuards';
import { sampleImmersionDirection } from '../../../../services/immersion/director';

// The donor draws Folia's current song and analyser; it never creates a media player.
export default function MineradioBackground({ config, coverUrl, paused, staticMode, audioBands, audioPower, lyricView }: VisualizerBackgroundRenderProps & { lyricView?: VisualizerSharedProps }) {
    const host = useMineradioHost();
    const renderingSuspended = useLowPowerRenderHold();
    const lowPowerMode = useDesktopSettingsStore(state => state.lowPowerMode);
    const drawn = useFirstFrameDrawn();
    const song = usePlaybackStore(selectDisplaySong);
    const lyrics = usePlaybackStore(state => state.lyrics);
    const duration = usePlaybackStore(state => state.duration);
    const response = useRef<ReturnType<typeof createMusicResponse> | null>(null);
    if (!response.current) response.current = createMusicResponse();
    const currentTime = lyricView && (lyricView.isPreviewMode || !isMainAppSurface) ? lyricView.currentTime : signals.currentTime;
    const tuning = useVisualizerSettingsStore(state => state.mineradioBackgroundTuning);
    const title = lyricView ? lyricView.songTitle : song?.name;
    const artist = lyricView ? lyricView.songArtist : song?.artists.map(item => item.name).join(', ');
    const album = lyricView ? lyricView.songAlbum : song?.album.name;
    const trackKey = song ? `${getPlaybackSongKey(song)}:${song.playbackSourceRevision ?? ''}` : `preview:${title ?? ''}:${artist ?? ''}`;
    const metadata = useMemo(() => ({ title: title ?? undefined, artist: artist ?? undefined, album: album ?? undefined, coverUrl, trackKey }), [title, artist, album, coverUrl, trackKey]);
    const onCommand = useCallback((command: StageCommand) => {
        if (command.action === 'settings') useVisualizerSettingsStore.getState().handleSetMineradioBackgroundTuning(command.value as Record<string, string | number | boolean>);
        else host.onCommand?.(command);
    }, [host.onCommand]);
    return <MineradioStage
        currentTime={currentTime}
        lyricTime={lyricView?.currentTime ?? signals.lyricCurrentTime}
        duration={lyricView?.duration ?? duration}
        paused={paused}
        reducedMotion={staticMode}
        lowPowerMode={lowPowerMode}
        renderingSuspended={renderingSuspended}
        lyricRendererLabel={i18n.t('options.mineradioLyricRenderer')}
        lyricRenderer={lyricView ? 'mineradio' : 'folia'}
        metadata={metadata}
        lines={lyricView?.lines ?? lyrics?.lines}
        wordTiming={lyricView ? lyricView.lines.some(line => line.timingGranularity === 'word') : lyrics?.isWordByWord === true}
        settings={config?.mineradio?.tuning ?? tuning}
        collections={host.collections}
        queue={host.queue}
        showControls={host.showControls ?? false}
        showLyrics={lyricView ? lyricView.showText !== false : host.showLyrics ?? false}
        sampleDirection={() => isMainAppSurface && !lyricView?.isPreviewMode && song ? sampleImmersionDirection(getPlaybackSongKey(song), currentTime.get()) : null}
        sampleAudio={() => {
            const spectrum = audioBands.spectrum?.get();
            return response.current!.update({
                nowMs: performance.now(), position: currentTime.get(), trackKey, paused,
                audio: host.audioAvailable === false || !spectrum?.length ? null : {
                    bass: audioBands.bass.get(), mid: audioBands.mid.get(), treble: audioBands.treble.get(), energy: audioPower.get(),
                    beat: getBeatListImpact(BEAT_EFFECT_IDS.mineradioPulse), spectrum,
                },
            });
        }}
        onCommand={onCommand}
        onReady={drawn}
    />;
}
