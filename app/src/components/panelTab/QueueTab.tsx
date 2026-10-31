import React from 'react';
import { List, useListRef, type RowComponentProps } from 'react-window';
import { ListEnd, ListMusic, ListPlus, PanelsTopLeft, Shuffle, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SongResult } from '../../types';
import TextInputDialog from '../shared/TextInputDialog';
import { Button } from '../modal/settings/kit';
import { useKitReducedMotion } from '../modal/settings/kit/motion';
import { getSongUnavailableLabel, isSongUnavailable } from '../../services/onlineMusic/songAvailability';
import { getSongArtistLabel } from '../../services/onlineMusic/songMetadata';
import { getPlaybackSongKey } from '../../utils/appPlaybackGuards';
import { queueIndexOfKey } from '../../utils/playbackNeighbors';
import { EmptyState } from './shell/EmptyState';
import { PanelIconButton } from './shell/PanelIconButton';
import { selectVerifiedExternalQueue, useExternalPlaybackStore } from '../app/externalPlayback/useExternalPlaybackStore';
import { omni } from '../../services/onlineMusic/omni';
import { usesExternalQueue } from '../app/externalPlayback/externalPlaybackRuntime';
import { openLoginWindow } from '../login/loginWindowStore';
import { EXTERNAL_QUEUE_COPY, externalQueueMessage } from '../app/externalPlayback/externalQueueStatus';

// src/components/panelTab/QueueTab.tsx
// The panel's queue tab: a line with the number of songs and the queue's own buttons, then the
// queue as a list that scrolls inside itself. The list is as tall as its rows, seven and a half
// of them at most, and lower where the window leaves less (--pn-tab-room, from the panel's frame);
// while more rows follow it fades at the bottom. A row plays its song; its three actions show
// under the pointer and when the keyboard reaches them.

const ROW_PX = 48;
/** The line above the list. */
const HEAD_PX = 36;
/** Seven and a half rows: the half row says that more follow. */
const LIST_MAX_PX = 7.5 * ROW_PX;
/** The list fades over this much of its bottom while more rows follow. */
const FADE = 'linear-gradient(#000 calc(100% - 32px), transparent)';

interface QueueTabProps {
    playQueue: SongResult[];
    currentSong: SongResult | null;
    onPlaySong: (song: SongResult, queue: SongResult[]) => void;
    queueScrollRef: React.RefObject<HTMLDivElement | null>;
    shouldScrollToCurrent?: boolean;
    onShuffle?: () => void;
    onRemoveSong: (index: number) => void;
    onMoveSongToEnd: (index: number) => void;
    onMoveSongToNext: (index: number) => void;
    canSaveLocalPlaylist?: boolean;
    /** Opens the same queue as a poster wall; absent when the host has no wall to show. */
    onOpenLattice?: () => void;
    onSaveCurrentQueueAsPlaylist?: (name: string) => Promise<void>;
    isDaylight?: boolean;
}

type QueueRowProps = {
    playQueue: SongResult[];
    currentSongKey: string | null;
    onPlaySong: QueueTabProps['onPlaySong'];
    onMoveSongToNext: QueueTabProps['onMoveSongToNext'];
    onMoveSongToEnd: QueueTabProps['onMoveSongToEnd'];
    onRemoveSong: QueueTabProps['onRemoveSong'];
    readOnly: boolean;
    labels: {
        unavailable: string;
        playNext: string;
        moveToEnd: string;
        remove: string;
    };
};

// Kept outside QueueTab so track changes update row data without remounting hovered action buttons.
const QueueRow = ({
    index,
    style,
    ariaAttributes,
    playQueue,
    currentSongKey,
    onPlaySong,
    onMoveSongToNext,
    onMoveSongToEnd,
    onRemoveSong,
    readOnly,
    labels,
}: RowComponentProps<QueueRowProps>): React.ReactElement => {
    const song = playQueue[index];
    const isActive = currentSongKey === getPlaybackSongKey(song);
    const isUnavailable = isSongUnavailable(song);

    return (
        <div
            style={style}
            data-active={isActive}
            {...ariaAttributes}
            className={`st-t-fast group flex cursor-pointer items-center rounded-lg pl-3 pr-1.5 transition-colors ${isActive ? 'bg-[var(--st-fill)]' : 'hover:bg-[var(--st-fill)] focus-within:bg-[var(--st-fill)]'}`}
        >
            {isActive && <span aria-hidden className="absolute inset-y-3.5 left-0 w-[3px] rounded-r-sm bg-[var(--st-accent)]" />}
            <button type="button" disabled={readOnly} onClick={() => onPlaySong(song, playQueue)} className={`min-w-0 flex-1 h-full text-left disabled:cursor-default focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--st-accent)] ${isUnavailable ? 'opacity-55' : ''}`}>
                <span className="flex items-center gap-2 text-[13px] leading-[19px]">
                    <span className={`truncate ${isActive ? 'font-semibold' : ''}`}>{song.name}</span>
                    {isUnavailable && (
                        <span className="shrink-0 rounded bg-[var(--st-fill2)] px-[5px] py-px text-[11px] leading-[15px] text-[color:var(--st-t2)]">
                            {getSongUnavailableLabel(song, labels.unavailable)}
                        </span>
                    )}
                </span>
                <span className="block truncate text-xs leading-[17px] text-[color:var(--st-t3)]">{getSongArtistLabel(song)}</span>
            </button>
            {/* No width until the pointer or the keyboard is on the row, so a long name has the whole row. The play button and row actions remain separate keyboard stops. */}
            {!readOnly && <div className="st-t-fast flex w-0 shrink-0 items-center gap-0.5 overflow-hidden opacity-0 transition-opacity group-focus-within:ml-2 group-focus-within:w-auto group-focus-within:opacity-100 group-hover:ml-2 group-hover:w-auto group-hover:opacity-100">
                {[
                    { label: labels.playNext, icon: ListPlus, action: onMoveSongToNext },
                    { label: labels.moveToEnd, icon: ListEnd, action: onMoveSongToEnd },
                    { label: labels.remove, icon: Trash2, action: onRemoveSong },
                ].map(({ label, icon: Icon, action }) => (
                    <PanelIconButton
                        key={label}
                        size="s"
                        label={label}
                        onClick={(event) => {
                            event.stopPropagation();
                            if (event.detail > 0) {
                                event.currentTarget.blur();
                            }
                            action(index);
                        }}
                    >
                        <Icon size={15} />
                    </PanelIconButton>
                ))}
            </div>}
        </div>
    );
};

const QueueTab: React.FC<QueueTabProps> = ({
    playQueue: appQueue,
    currentSong,
    onPlaySong,
    queueScrollRef,
    shouldScrollToCurrent = false,
    onShuffle,
    onRemoveSong,
    onMoveSongToEnd,
    onMoveSongToNext,
    canSaveLocalPlaylist = false,
    onOpenLattice,
    onSaveCurrentQueueAsPlaylist,
    isDaylight = false,
}) => {
    const { t } = useTranslation();
    const nativeContext = useExternalPlaybackStore(state => state.context);
    const externalQueue = useExternalPlaybackStore(state => state.queue);
    const queueStatus = useExternalPlaybackStore(state => state.queueStatus);
    const queueCopy = EXTERNAL_QUEUE_COPY[queueStatus];
    const nativeQueue = usesExternalQueue(currentSong);
    const providerId = nativeContext?.providerId ?? (currentSong?.sourceRef?.kind === 'online' ? currentSong.sourceRef.providerId : null);
    const providerLabel = providerId ? omni.getProviderLabel(providerId) : '';
    const reduced = useKitReducedMotion();
    const currentSongKey = currentSong ? getPlaybackSongKey(currentSong) : null;
    const playQueue = React.useMemo(() => nativeQueue
        ? selectVerifiedExternalQueue(currentSong, externalQueue)
        : appQueue, [appQueue, currentSong, externalQueue, nativeQueue]);
    // As tall as its rows up to the most it shows; never under two rows, so in a very low window
    // the tab scrolls instead.
    const rowsPx = Math.min(playQueue.length * ROW_PX, LIST_MAX_PX);
    const listHeight = `clamp(${Math.min(rowsPx, 2 * ROW_PX)}px, calc(var(--pn-tab-room, 100vh) - ${HEAD_PX}px), ${rowsPx}px)`;

    const listRef = useListRef(null);
    const isInitialMountRef = React.useRef(true);
    const lastScrolledIndexRef = React.useRef<number>(-1);
    const wasOpenRef = React.useRef(false);
    const [isSaveDialogOpen, setIsSaveDialogOpen] = React.useState(false);
    const [hasMoreBelow, setHasMoreBelow] = React.useState(false);
    const rowProps = React.useMemo<QueueRowProps>(() => ({
        playQueue,
        currentSongKey,
        onPlaySong,
        onMoveSongToNext,
        onMoveSongToEnd,
        onRemoveSong,
        readOnly: nativeQueue,
        labels: {
            unavailable: t('status.songUnavailableTag'),
            playNext: t('queue.playNext'),
            moveToEnd: t('queue.moveToEnd'),
            remove: t('queue.remove'),
        },
    }), [
        currentSongKey,
        nativeQueue,
        onMoveSongToEnd,
        onMoveSongToNext,
        onPlaySong,
        onRemoveSong,
        playQueue,
        t,
    ]);

    // Whether rows follow under what the list shows: read before the first frame is drawn, and
    // when the list scrolls, changes size or length. On the first frame the list's handle has no
    // element yet; the list is the one child of the element around it.
    const readHasMoreBelow = React.useCallback(() => {
        const list = listRef.current?.element ?? queueScrollRef.current?.firstElementChild;
        if (list) {
            setHasMoreBelow(list.scrollHeight - list.scrollTop - list.clientHeight > 4);
        }
    }, [listRef, queueScrollRef]);
    React.useLayoutEffect(readHasMoreBelow, [playQueue.length, readHasMoreBelow]);

    // Reset initial mount state when panel is opened
    React.useEffect(() => {
        if (shouldScrollToCurrent && !wasOpenRef.current) {
            isInitialMountRef.current = true;
            wasOpenRef.current = true;
        } else if (!shouldScrollToCurrent) {
            wasOpenRef.current = false;
        }
    }, [shouldScrollToCurrent]);

    // Auto-scroll to current song
    React.useEffect(() => {
        if (shouldScrollToCurrent && currentSongKey && listRef.current) {
            const currentIndex = queueIndexOfKey(playQueue, currentSongKey);
            if (currentIndex >= 0) {
                const isInitialMount = isInitialMountRef.current;
                const songChanged = lastScrolledIndexRef.current !== currentIndex && lastScrolledIndexRef.current !== -1;

                const behavior = (isInitialMount || !songChanged || reduced) ? 'instant' : 'smooth';
                const delay = isInitialMount ? 0 : 50;

                setTimeout(() => {
                    if (listRef.current) {
                        // The row before the playing one goes to the top: the rows line up with
                        // the list's top edge, and what was just played stays in view.
                        listRef.current.scrollToRow({
                            index: Math.max(0, currentIndex - 1),
                            align: 'start',
                            behavior: behavior as 'instant' | 'smooth'
                        });
                        lastScrolledIndexRef.current = currentIndex;
                        isInitialMountRef.current = false;
                    }
                }, delay);
            }
        }
    }, [shouldScrollToCurrent, currentSongKey, playQueue, listRef, reduced]);

    const handleSavePlaylist = async () => {
        if (!onSaveCurrentQueueAsPlaylist) {
            return;
        }
        setIsSaveDialogOpen(true);
    };

    if (playQueue.length === 0) {
        return <EmptyState icon={<ListMusic size={28} />}>
            <span role="status">{nativeQueue ? externalQueueMessage(queueStatus, providerLabel, t) : t('queue.empty')}</span>
            {nativeQueue && queueCopy.actionKey && providerId && <button type="button" className="mt-3 min-h-11 rounded-lg bg-[var(--st-fill)] px-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--st-accent)]" onClick={event => openLoginWindow(providerId, event.currentTarget, queueCopy.intent)}>{t(queueCopy.actionKey!, { provider: providerLabel })}</button>}
        </EmptyState>;
    }

    return (
        <>
            <div className="select-none">
                <div className="flex items-center gap-0.5 pb-1 pl-1" style={{ height: HEAD_PX }}>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-5 text-[color:var(--st-t2)]">
                        {nativeQueue ? t('queue.externalTitle', { provider: providerLabel }) : t('queue.title')}
                        <span className="ml-1.5 font-normal text-[color:var(--st-t3)]">{playQueue.length}</span>
                    </span>
                    {!nativeQueue && canSaveLocalPlaylist && (
                        <Button variant="quiet" onClick={handleSavePlaylist}>
                            {t('localMusic.saveQueueAsPlaylist')}
                        </Button>
                    )}
                    {!nativeQueue && onOpenLattice && (
                        <PanelIconButton size="s" label={t('home.lattice')} onClick={onOpenLattice}>
                            <PanelsTopLeft size={15} />
                        </PanelIconButton>
                    )}
                    {onShuffle && (
                        <PanelIconButton size="s" label={t('options.mineradioShuffle')} onClick={onShuffle}>
                            <Shuffle size={15} />
                        </PanelIconButton>
                    )}
                </div>
                {nativeQueue && <p role="status" className="mb-3 px-1 text-xs leading-relaxed text-[color:var(--st-t2)]">{t('queue.externalDescription', { provider: providerLabel })}</p>}

                <div ref={queueScrollRef}>
                    <List
                        listRef={listRef}
                        rowCount={playQueue.length}
                        rowHeight={ROW_PX}
                        // The list measures itself after its first frame; until then it takes this height, so that frame has all its rows.
                        defaultHeight={rowsPx}
                        rowComponent={QueueRow}
                        rowProps={rowProps}
                        overscanCount={5}
                        onScroll={readHasMoreBelow}
                        onResize={readHasMoreBelow}
                        className="st-scroll"
                        style={{ height: listHeight, width: '100%', maskImage: hasMoreBelow ? FADE : undefined }}
                    />
                </div>
            </div>

            <TextInputDialog
                isOpen={isSaveDialogOpen}
                onClose={() => setIsSaveDialogOpen(false)}
                isDaylight={isDaylight}
                title={t('localMusic.saveQueueAsPlaylist')}
                placeholder={t('localMusic.enterPlaylistName')}
                confirmLabel={t('localMusic.save')}
                onConfirm={async (playlistName) => {
                    try {
                        await onSaveCurrentQueueAsPlaylist?.(playlistName);
                    } catch (error) {
                        console.error('Failed to save local playlist', error);
                    }
                }}
            />
        </>
    );
};

export default QueueTab;
