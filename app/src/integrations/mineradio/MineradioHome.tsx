import React, { useEffect, useState } from 'react';
import { ArrowUpRight, Disc3, FolderOpen, Library, Play, Radio, Sparkles } from 'lucide-react';
import { homeContinueAction } from './controls';
import { openMineradioConsole } from './MineradioHost';
import type { StageCollection, StageCommand, StageMetadata, StageTrack } from './stageBridge';
import { externalQueueMessage, type ExternalQueueStatus } from '../../components/app/externalPlayback/externalQueueStatus';
import type { ProviderAccountSummary } from '../../types/onlineMusic';
import { openLoginWindow } from '../../components/login/loginWindowStore';
import { orderRows, rowStatus } from '../../components/login/platformRows';
import './MineradioHome.donor.css';
import './MineradioShell.css';

// React transplant of MineRadio's daily-review hero, quick cards and insight rail.
export interface MineradioHomeProps {
    metadata?: StageMetadata;
    collections?: StageCollection[];
    queue?: StageTrack[];
    nextUp?: StageTrack | null;
    paused: boolean;
    externalConnected?: boolean;
    externalSourceLabel?: string;
    providers?: readonly ProviderAccountSummary[];
    externalQueue?: boolean;
    externalQueueStatus?: ExternalQueueStatus;
    onCommand: (command: StageCommand) => void;
    t?: (key: string, options?: { provider: string }) => string;
}

export function MineradioHome({ metadata, collections = [], queue = [], nextUp: next = null, paused, externalConnected = false, externalSourceLabel = 'Streaming', providers = [], externalQueue = false, externalQueueStatus = 'unavailable', onCommand, t }: MineradioHomeProps) {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 30_000);
        return () => clearInterval(timer);
    }, []);
    const text = (key: string, fallback: string) => { const translated = t?.(`options.mineradio${key}`); return translated && translated !== `options.mineradio${key}` ? translated : fallback; };
    const cover = metadata?.coverUrl || collections.find(collection => collection.cover)?.cover;
    const command = (action: StageCommand['action'], value?: unknown) => onCommand({ action, ...(value === undefined ? {} : { value }) });
    const connectionLabel = externalConnected ? externalSourceLabel.toUpperCase() : text('ServicesLabel', 'MUSIC SERVICES');
    const connectionTitle = externalConnected ? externalSourceLabel : text('ConnectServices', 'Connect music services');
    const cards = [
        { tone: 'search', label: text('ContinueLabel', 'CONTINUE'), title: metadata?.title || text('Continue', 'Continue listening'), sub: metadata?.artist || text('ContinueHint', 'Pick up your queue'), action: () => onCommand(homeContinueAction(metadata, queue, paused)), icon: Play },
        { tone: 'library', label: text('LibraryLabel', 'LIBRARY'), title: text('Library', 'Music library'), sub: text('LibraryHint', 'Your playlists, albums and local files'), action: () => command('openLibrary'), icon: Library },
        { tone: 'mix', label: connectionLabel, title: connectionTitle, sub: externalConnected ? text('ExternalHint', 'Browse your saved music') : text('ConnectHint', 'Bring your streaming library into the room'), action: () => command(externalConnected ? 'openLibrary' : 'connectSource'), icon: Radio },
        { tone: 'playlist', label: text('LocalMusicLabel', 'LOCAL MUSIC'), title: text('ImportMusic', 'Import your music'), sub: text('ImportHint', 'Choose audio files from your Mac'), action: () => command('openFiles'), icon: FolderOpen },
    ];
    return <div className="mineradio-home diy-mode empty-home-active">
        <section id="empty-home" aria-label={text('MusicHome', 'Music home')}>
            <div className="empty-home-shell">
                <div className="home-hero" style={cover ? { backgroundImage: `linear-gradient(100deg,rgba(5,8,12,.12),rgba(5,8,12,.5)),url(${JSON.stringify(cover)})` } : undefined}>
                    <div className="daily-review-card">
                        <div id="daily-review-date" className="daily-review-date">{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
                        <div id="daily-review-time" className="daily-review-time">{now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
                        <div className="daily-review-quote">{metadata?.title ? `${metadata.title}${metadata.artist ? ` — ${metadata.artist}` : ''}` : text('Welcome', 'Let the room become your music.')}</div>
                        <div className="daily-review-source">IMMERSIVE · FOLIA × MINERADIO</div>
                        <div className="daily-review-actions">
                            <button type="button" onClick={() => metadata?.title ? command('openPlayer') : command('openFiles')}><Disc3 size={14} />{metadata?.title ? text('OpenPlayer', 'Now playing') : text('ImportMusic', 'Import your music')}</button>
                            <button type="button" onClick={event => { command('openPlayer'); openMineradioConsole(event); }}><Sparkles size={14} />{text('VisualConsole', 'Visual effects')}</button>
                            <button type="button" onClick={() => command('openLibrary')}><Library size={14} />{text('FoliaLibrary', 'Music library')}</button>
                        </div>
                    </div>
                </div>
                <div className="home-grid home-quick-grid" aria-label={text('QuickActions', 'Music shortcuts')}>
                    {cards.map((card, index) => <button key={card.tone} className={`home-card ${index ? 'home-card-quick' : 'home-card-featured'}`} data-home-tone={card.tone} type="button" onClick={card.action}>
                        <div className="home-card-label">{card.label}</div>
                        <div className="home-card-title">{card.title}</div>
                        <div className="home-card-sub">{card.sub}</div>
                        <div className="home-card-art" aria-hidden="true"><card.icon size={46} strokeWidth={1.2} /></div>
                    </button>)}
                </div>
                <div className="home-rail home-insight-rail">
                    <div className="mb-4 flex flex-wrap gap-3" role="group" aria-label={text('ConnectServices', 'Connect music services')}>
                        {orderRows(providers, null).map(provider => (
                            <button
                                key={provider.providerId}
                                type="button"
                                disabled={rowStatus(provider) === 'off'}
                                title={rowStatus(provider) === 'off' ? t?.('home.providerNotConfigured') : undefined}
                                onClick={event => openLoginWindow(provider.providerId, event.currentTarget)}
                                className="rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {provider.status === 'authenticated' ? text('Account', 'Account') : text('ConnectSource', 'Connect')} {provider.displayName}
                            </button>
                        ))}
                    </div>
                    <div id="home-insight-dock" className="home-insight-dock">
                        <section className="home-insight-card home-listen-card" aria-labelledby="home-listen-heading">
                            <div className="home-insight-head"><div id="home-listen-heading" className="home-insight-kicker">{text('YourMusic', 'YOUR MUSIC')}</div><button className="home-insight-link" type="button" onClick={() => command('openLibrary')}>{text('Explore', 'Explore')} <ArrowUpRight size={12} /></button></div>
                            <div className="home-listen-metrics">
                                <div className="home-listen-metric"><strong className="home-listen-value">{collections.length}</strong><span className="home-listen-label">{text('Collections', 'Collections')}</span></div>
                                <div className="home-listen-metric"><strong className="home-listen-value">{queue.length}</strong><span className="home-listen-label">{text('InQueue', 'In queue')}</span></div>
                                <div className="home-listen-metric"><strong className="home-listen-value">{externalConnected ? externalSourceLabel : text('Local', 'Local')}</strong><span className="home-listen-label">{text('MusicSource', 'Music source')}</span></div>
                            </div>
                        </section>
                        <button id="home-next-card" className="home-insight-card home-next-card" type="button" onClick={() => externalQueue ? command('openQueue') : next ? command('selectTrack', next.id) : command(queue.length ? 'openQueue' : 'openFiles')}>
                            <span className="home-next-cover" aria-hidden="true" style={next?.cover ? { backgroundImage: `url(${JSON.stringify(next.cover)})` } : undefined} />
                            <span className="home-next-copy"><span className="home-insight-kicker">{text('NextUpLabel', 'NEXT UP')}</span><span className="home-next-title">{next?.title || (externalQueue ? externalQueueMessage(externalQueueStatus, externalSourceLabel, t) : queue.length ? text('NoUpcomingTrack', 'No upcoming track') : text('QueueEmpty', 'Your queue is waiting'))}</span><span className="home-next-sub">{next ? next.artist : externalQueue ? externalSourceLabel : queue.length ? text('ChooseNextTrack', 'Open your queue to choose what plays next') : text('QueueEmptyHint', 'Import music to begin listening')}</span></span>
                            <span className="home-next-arrow" aria-hidden="true">›</span>
                        </button>
                        <section className="home-discovery-strip" aria-label={text('Collections', 'Collections')}>
                            <div className="home-discovery-copy"><span className="home-insight-kicker">{text('FromYourLibrary', 'FROM YOUR LIBRARY')}</span><span className="home-discovery-title">{text('FindYourSound', 'Find your sound again')}</span><span className="home-discovery-sub">{text('CollectionHint', 'Your saved collections, ready to play')}</span></div>
                            <div className="home-discovery-list">
                                {collections.slice(0, 5).map(collection => <button className="home-discovery-song" type="button" key={collection.id} onClick={() => command('selectCollection', collection.id)} title={collection.name}>
                                    <span className="home-discovery-cover" style={collection.cover ? { backgroundImage: `url(${JSON.stringify(collection.cover)})` } : undefined}>{!collection.cover && <Disc3 size={24} />}</span>
                                    <span className="home-discovery-song-copy"><span className="home-discovery-song-name">{collection.name}</span><span className="home-discovery-song-artist">{collection.trackCount !== undefined ? `${collection.trackCount} ${text('Tracks', 'tracks')}` : text('Collection', 'Collection')}</span></span>
                                </button>)}
                                {!collections.length && <button className="home-empty-library" type="button" onClick={() => command('openFiles')}><FolderOpen size={24} /><strong>{text('LibraryEmpty', 'Make this space yours')}</strong><span>{text('LibraryEmptyHint', 'Import local music or connect streaming')}</span></button>}
                            </div>
                        </section>
                        <button className="home-insight-card home-ranking-entry" type="button" onClick={() => command('openLibrary')}><span className="home-ranking-entry-copy"><span className="home-insight-kicker">{text('FoliaLibraryLabel', 'MUSIC LIBRARY')}</span><span className="home-ranking-entry-title">{text('FullLibrary', 'Your complete music library')}</span><span className="home-ranking-entry-sub">{text('FullLibraryHint', 'Search, organize, import lyrics and build a queue')}</span></span><span className="home-ranking-entry-art" aria-hidden="true"><i /><i /><i /><i /><i /></span><span className="home-next-arrow" aria-hidden="true">›</span></button>
                        <button className="home-insight-card home-ranking-entry home-radio-entry" type="button" onClick={() => command(externalConnected ? 'openPlayer' : 'connectSource')}><span className="home-ranking-entry-copy"><span className="home-insight-kicker">{externalConnected ? text('PlayerLabel', 'NOW PLAYING') : connectionLabel}</span><span className="home-ranking-entry-title">{externalConnected ? text('OpenPlayer', 'Now playing') : connectionTitle}</span><span className="home-ranking-entry-sub">{externalConnected ? text('ImmersiveHint', 'Thirteen scenes with synchronized lyrics') : text('ConnectHint', 'Bring your streaming library into the room')}</span></span><span className="home-radio-entry-art" aria-hidden="true"><i /><i /></span><span className="home-next-arrow" aria-hidden="true">›</span></button>
                    </div>
                </div>
            </div>
        </section>
    </div>;
}
