// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';
import { makeStageFrame } from '../../../src/integrations/mineradio/stageBridge';
import { mineradioConsoleEn, mineradioConsoleZhCN, mineradioConsoleId } from '../../../src/integrations/mineradio/consoleCopy';

// The donor console translates UI text while user content and unsupported capabilities stay honest.
declare global { interface Window { MineradioConsole: { apply(locale: string, copy: unknown): void; bindCapabilities(command: (action: string) => void, rangeKeys: Record<string, string>): void; dispose(): void; }; } }
const helper = () => { window.eval(readFileSync('public/mineradio/stageConsole.js', 'utf8')); return window.MineradioConsole; };
afterEach(() => { window.MineradioConsole?.dispose(); document.body.replaceChildren(); });

it('carries the resolved locale and one copy catalogue without changing music or archives', () => {
    const metadata = { title: '视觉预设', artist: '歌词' };
    const settings = { archivesJson: '[{"name":"常用"}]' };
    const consoleCopy = mineradioConsoleId;
    const frame = makeStageFrame({ currentTime: 2, paused: false, locale: 'id', consoleCopy, metadata, settings });
    expect(frame.locale).toBe('id');
    expect(frame.consoleCopy).toBe(consoleCopy);
    expect(frame.metadata).toBe(metadata);
    expect(frame.settings).toBe(settings);
});

it('switches static text, titles and aria labels, including later UI, without translating user content', async () => {
    document.body.innerHTML = '<div id="fx-panel"><h2 title="视觉控制台" aria-label="视觉控制台">视觉控制台</h2><button data-stage-close aria-label="Close visual console">×</button><div class="user-archive-name" title="视觉预设">视觉预设</div><input value="歌词"><div id="preset-grid">视觉预设</div><div id="user-archive-grid"></div></div><strong id="stage-title">视觉预设</strong>';
    const console = helper();
    console.apply('en', mineradioConsoleEn);
    expect(document.querySelector('h2')!.textContent).toBe('Visual console');
    expect(document.querySelector('h2')!.getAttribute('aria-label')).toBe('Visual console');
    expect(document.querySelector('[data-stage-close]')!.getAttribute('aria-label')).toBe('Close visual console');
    expect(document.querySelector('.user-archive-name')!.textContent).toBe('视觉预设');
    expect(document.querySelector('.user-archive-name')!.getAttribute('title')).toBe('视觉预设');
    expect(document.querySelector('input')!.value).toBe('歌词');
    expect(document.querySelector('#stage-title')!.textContent).toBe('视觉预设');
    document.querySelector('#user-archive-grid')!.innerHTML = '<button>保存</button><div class="user-archive-name">保存</div>';
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(document.querySelector('#user-archive-grid button')!.textContent).toBe('Save');
    expect(document.querySelector('#user-archive-grid .user-archive-name')!.textContent).toBe('保存');
    console.apply('id', mineradioConsoleId);
    expect(document.querySelector('h2')!.textContent).toBe('Konsol visual');
    expect(document.querySelector('[data-stage-close]')!.getAttribute('aria-label')).toBe('Tutup konsol visual');
    console.apply('zh-CN', mineradioConsoleZhCN);
    expect(document.querySelector('h2')!.textContent).toBe('视觉控制台');
    expect(document.querySelector('[data-stage-close]')!.getAttribute('aria-label')).toBe('关闭视觉控制台');
});

it('disables unavailable sliders and points actual host settings to a working destination', () => {
    document.body.innerHTML = '<div id="fx-panel"><section class="fx-console-group" data-fx-console-tab="system" data-fx-console-group="memory"><input id="fx-memory-interval" type="range" oninput="runMemory()"></section><section class="fx-console-group" data-fx-console-tab="system" data-fx-console-group="output"><div class="fx-console-group-body"><input type="range" oninput="routeDevice()"></div></section><section><input id="fx-point" type="range"></section><div id="t-desktopLyrics" class="fx-toggle" onclick="toggleFx(\'desktopLyrics\')"></div></div>';
    const commands: string[] = [];
    const console = helper();
    console.bindCapabilities(action => commands.push(action), { 'fx-point': 'point' });
    console.apply('en', mineradioConsoleEn);
    const memory = document.querySelector<HTMLInputElement>('#fx-memory-interval')!;
    expect(memory.disabled).toBe(true);
    expect(memory.hasAttribute('oninput')).toBe(false);
    expect(memory.title).toBe('This Windows memory tool is unavailable in this player.');
    expect(document.querySelector<HTMLInputElement>('#fx-point')!.disabled).toBe(false);
    const destination = document.querySelector<HTMLButtonElement>('[data-stage-host-settings]')!;
    expect(destination.textContent).toBe('Open player settings');
    destination.click();
    expect(commands).toEqual(['openSettings']);
    const toggle = document.querySelector('#t-desktopLyrics')!;
    expect(toggle.getAttribute('aria-disabled')).toBe('true');
    expect(toggle.getAttribute('tabindex')).toBe('-1');
});
