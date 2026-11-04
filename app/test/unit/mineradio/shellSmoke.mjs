import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'vite';
import { chromium } from 'playwright';

function assertTimelineInsidePlate({ plate, rail, thumb }) {
    const radius = Math.min(50, plate.width / 2, plate.height / 2);
    for (const rect of [rail, thumb]) for (const x of [rect.x, rect.x + rect.width]) for (const y of [rect.y, rect.y + rect.height]) {
        const cx = Math.max(plate.x + radius, Math.min(x, plate.x + plate.width - radius));
        const cy = Math.max(plate.y + radius, Math.min(y, plate.y + plate.height - radius));
        assert.ok(x >= plate.x && x <= plate.x + plate.width && y >= plate.y && y <= plate.y + plate.height && Math.hypot(x - cx, y - cy) <= radius + .5, `Timeline protrudes through the rounded plate: ${JSON.stringify({ plate, rect, x, y })}`);
    }
}

// Runs the transplanted React surfaces with real DOM interactions at the acceptance sizes.
const server = process.env.VITE_URL ? null : await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: false }, clearScreen: false });
let browser;
try {
    await server?.listen();
    const baseUrl = process.env.VITE_URL || `http://127.0.0.1:${server.httpServer.address().port}`;
    const chrome = process.env.BROWSER_PATH || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', chromium.executablePath()].find(file => fs.existsSync(file));
    browser = await chromium.launch({ headless: true, executablePath: chrome });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    // Keep screenshots on the same installed fallback fonts when the remote CJK CDN is unavailable.
    await page.route('https://cdn.jsdmirror.cn/**', route => route.abort());
    await page.route('https://fonts.googleapis.com/**', route => route.abort());
    page.setDefaultTimeout(5000);
    page.setDefaultNavigationTimeout(30000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.stack));
    if (!process.env.DOCK_ONLY) {
    await page.goto(`${baseUrl}/test/unit/mineradio/shellFixture.html`);
    if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/mineradio-shell-initial.png` });
    for (const id of ['play-btn', 'prev-btn', 'next-btn']) assert.equal(await page.locator(`.mineradio-dock #${id}`).isDisabled(), true);
    await page.getByRole('button', { name: 'Import your music', exact: true }).first().click();
    await page.getByRole('button', { name: /Connect music services/ }).first().click();
    assert.ok((await page.evaluate(() => window.shellCommands)).some(command => command.action === 'openFiles'));
    assert.ok((await page.evaluate(() => window.shellCommands)).some(command => command.action === 'connectSource'));
    for (const [providerId, label] of [['spotify', 'Spotify'], ['kugou', 'KuGou Music'], ['qq', 'QQ Music']]) {
        const button = page.getByRole('button', { name: `Connect ${label}`, exact: true });
        await button.focus();
        await page.keyboard.press('Enter');
        assert.equal(await page.evaluate(() => window.shellCommands.at(-1).value), providerId);
    }
    assert.equal(await page.getByRole('button', { name: 'Connect Unconfigured', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Connect Unsupported', exact: true }).count(), 0);
    await page.goto(`${baseUrl}/test/unit/mineradio/shellFixture.html?populated=true`);
    await page.getByRole('button', { name: 'Account Spotify', exact: true }).click();
    assert.equal(await page.evaluate(() => window.shellCommands.at(-1).value), 'spotify');
    await page.getByRole('button', { name: 'Connect QQ Music', exact: true }).click();
    assert.equal(await page.evaluate(() => window.shellCommands.at(-1).value), 'qq');
    await page.getByRole('button', { name: /Local collection/ }).click();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await page.getByRole('button', { name: 'Next track', exact: true }).click();
    await page.getByRole('slider', { name: 'Playback position' }).focus();
    await page.keyboard.press('End');
    const actions = await page.evaluate(() => window.shellCommands);
    assert.ok(actions.some(command => command.action === 'selectCollection' && command.value === 'collection-a'));
    assert.ok(actions.some(command => command.action === 'playPause'));
    assert.ok(actions.some(command => command.action === 'next'));
    assert.ok(actions.some(command => command.action === 'seek' && command.value === 180));
    await page.evaluate(() => window.shellClock.set(45));
    await page.waitForTimeout(50);
    assert.equal(await page.locator('.mineradio-dock #time-display').textContent(), '00:45 / 03:00');
    for (const [width, height] of [[640, 640], [760, 640], [960, 640], [1280, 800], [1440, 900], [1920, 1080]]) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(100);
        assert.equal(await page.locator('.home-hero').evaluate(element => {
            return element.scrollHeight <= element.clientHeight;
        }), true, `Hero content is clipped at ${width}`);
        const cardGeometry = await page.locator('.home-quick-grid .home-card').evaluateAll(cards => cards.map(card => {
            const bounds = card.getBoundingClientRect();
            const art = card.querySelector('.home-card-art').getBoundingClientRect();
            const text = [...card.querySelectorAll('.home-card-label,.home-card-title,.home-card-sub')].map(element => element.getBoundingClientRect());
            return { inside: art.left >= bounds.left && art.right <= bounds.right && art.top >= bounds.top && art.bottom <= bounds.bottom, reserved: getComputedStyle(card.querySelector('.home-card-art')).width === '64px', separate: text.every(box => box.right <= art.left) };
        }));
        assert.ok(cardGeometry.every(card => card.inside && card.reserved && card.separate), `Shortcut text/art geometry at ${width}: ${JSON.stringify(cardGeometry)}`);
        for (const button of await page.locator('.daily-review-actions button').all()) {
            await button.scrollIntoViewIfNeeded();
            assert.equal(await button.evaluate(element => {
                const bounds = element.getBoundingClientRect();
                return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
            }), true, `Hero action clipped at ${width}: ${await button.textContent()}`);
        }
        for (const card of await page.locator('.home-card, .home-discovery-song').all()) {
            await card.hover({ force: true });
            await page.waitForTimeout(260);
            assert.equal(await card.evaluate(element => {
                const bounds = element.getBoundingClientRect();
                return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.top + 1));
            }), true, `Hovered card clipped at ${width}: ${await card.textContent()}`);
        }
        assert.equal(await page.locator('.home-listen-value, .home-listen-label').evaluateAll(elements => elements.every(element => element.scrollWidth <= element.clientWidth)), true, `Music summary is truncated at ${width}`);
        const bounds = await page.locator('.mineradio-dock #bottom-bar').boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1, `Dock overflow at ${width}`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `Page overflow at ${width}`);
        assert.equal(await page.locator('.mineradio-home').evaluate(element => element.scrollWidth <= element.clientWidth), true, `Home overflow at ${width}`);
        const clusters = await page.locator('.mineradio-dock #controls > .control-cluster').evaluateAll(elements => elements.map(element => ({ left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right })));
        assert.ok(clusters[0].right <= clusters[1].left + 1 && clusters[1].right <= clusters[2].left + 1, `Dock clusters overlap at ${width}`);
        await page.locator('.mineradio-dock #bottom-bar').evaluate(element => element.getAnimations().forEach(animation => animation.finish()));
        const overlapping = await page.locator('.mineradio-dock button').evaluateAll(elements => {
            const buttons = elements.filter(element => element.getClientRects().length).map(element => ({ label: element.getAttribute('aria-label') || element.id, bounds: element.getBoundingClientRect() }));
            return buttons.flatMap((button, index) => buttons.slice(index + 1).filter(other =>
                Math.min(button.bounds.right, other.bounds.right) - Math.max(button.bounds.left, other.bounds.left) > 1 &&
                Math.min(button.bounds.bottom, other.bounds.bottom) - Math.max(button.bounds.top, other.bounds.top) > 1
            ).map(other => `${button.label} / ${other.label}`));
        });
        assert.deepEqual(overlapping, [], `Dock buttons overlap at ${width}`);
        if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/mineradio-shell-${width}.png` });
    }
    }
    for (const [width, height] of [[960, 640], [1440, 900]]) {
        const page = await browser.newPage({ viewport: { width, height } });
        await page.bringToFront();
        await page.route('https://cdn.jsdmirror.cn/**', route => route.abort());
        await page.route('https://fonts.googleapis.com/**', route => route.abort());
        page.setDefaultTimeout(5000);
        page.setDefaultNavigationTimeout(30000);
        page.on('pageerror', error => errors.push(error.stack));
        await page.goto(`${baseUrl}/test/unit/mineradio/shellFixture.html?populated=true&compact=true`);
        await page.mouse.move(20, 20);
        const bar = page.locator('.mineradio-dock #bottom-bar');
        await page.evaluate(() => {
            window.readDockTimeline = () => {
                const thumb = document.querySelector('#progress-thumb');
                const bounds = thumb.getBoundingClientRect();
                return {
                    plate: document.querySelector('#bottom-bar').getBoundingClientRect().toJSON(),
                    rail: document.querySelector('#progress-bar').getBoundingClientRect().toJSON(),
                    thumb: { x: bounds.x + bounds.width / 2 - thumb.offsetWidth / 2, y: bounds.y + bounds.height / 2 - thumb.offsetHeight / 2, width: thumb.offsetWidth, height: thumb.offsetHeight },
                };
            };
        });
        await page.waitForFunction(() => document.querySelector('#bottom-bar')?.dataset.dockState === 'compact', undefined, { polling: 50, timeout: 5000 });
        await page.waitForFunction(() => Math.abs(document.querySelector('#bottom-bar').getBoundingClientRect().width - 460) < 1);
        for (const time of [0, 180]) {
            await page.evaluate(value => window.shellClock.set(value), time);
            assertTimelineInsidePlate(await page.evaluate(() => window.readDockTimeline()));
        }
        const compact = await bar.boundingBox();
        const compactPlay = await page.locator('#play-btn').boundingBox();
        const handle = page.locator('[data-testid="panel-toggle"] button');
        const compactHandle = await handle.boundingBox();
        const handleIsReachable = () => handle.evaluate(element => {
            const rect = element.getBoundingClientRect();
            return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
        });
        assert.ok(await handleIsReachable(), 'Right handle is reachable beside the compact dock');
        const essentialBounds = await page.locator('#control-cover,#control-title,#prev-btn,#play-btn,#next-btn,#time-display').evaluateAll(elements => elements.map(element => {
            const { x, y, width, height } = element.getBoundingClientRect();
            return { id: element.id, x, y, width, height };
        }));
        assert.ok(Math.abs(compact.x + compact.width / 2 - width / 2) < 1, 'Compact dock stays centered');
        assert.equal(await page.locator('.control-cluster.modes button').first().isVisible(), false);
        assert.equal(await page.locator('#time-display').isVisible(), true);
        assert.equal(await page.locator('#play-btn').isVisible(), true);
        assert.equal(await page.getByRole('slider', { name: 'Playback position' }).isVisible(), true);
        if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/dock-compact-${width}.png` });

        await page.evaluate(() => {
            window.collectDockMotion = () => {
                window.dockMotionFrames = [];
                const start = performance.now();
                function sample(now) {
                    const bounds = document.querySelector('#bottom-bar').getBoundingClientRect();
                    const buttons = [...document.querySelectorAll('#control-cover,#control-title,#prev-btn,#play-btn,#next-btn,#time-display')].map(element => {
                        const { x, y, width, height } = element.getBoundingClientRect();
                        return { id: element.id, x, y, width, height };
                    });
                    window.dockMotionFrames.push({ at: now - start, left: bounds.left, right: bounds.right, width: bounds.width, buttons, timeline: window.readDockTimeline() });
                    if (now - start < 900) requestAnimationFrame(sample);
                }
                requestAnimationFrame(sample);
            };
            window.collectDockMotion();
        });
        const compactNext = await page.locator('#next-btn').boundingBox();
        await page.mouse.move(compactNext.x + compactNext.width / 2, compactNext.y + compactNext.height / 2);
        await page.mouse.down();
        await page.waitForTimeout(80);
        await page.mouse.up();
        assert.ok((await page.evaluate(() => window.shellCommands)).some(command => command.action === 'next'), 'A fast click must still hit the same essential control during expansion');
        await bar.hover();
        await page.waitForFunction(() => document.querySelector('#bottom-bar')?.dataset.dockState === 'expanded');
        await page.waitForFunction(target => Math.abs(document.querySelector('#bottom-bar').getBoundingClientRect().width - target) < 1, Math.min(1240, width - 192));
        await page.waitForTimeout(250);
        const expanded = await bar.boundingBox();
        const expandedPlay = await page.locator('#play-btn').boundingBox();
        assert.ok(Math.abs(expandedPlay.x + expandedPlay.width / 2 - compactPlay.x - compactPlay.width / 2) < 1, 'The main playback target must not move away from the cursor');
        console.log(JSON.stringify({ viewport: width, compact, expanded, playShift: expandedPlay.x + expandedPlay.width / 2 - compactPlay.x - compactPlay.width / 2 }));
        assert.ok(expanded.width > compact.width + 200 && expanded.height > compact.height, 'Hover reveals a larger control surface');
        assert.ok(Math.abs(expanded.x + expanded.width / 2 - width / 2) < 1, 'Expanded dock stays centered');
        assert.equal(await page.locator('.control-cluster.modes').isVisible(), true);
        const frames = await page.evaluate(() => window.dockMotionFrames);
        assert.ok(frames.length > 5, 'Expansion is sampled over several frames');
        assert.ok(frames.every(frame => frame.left >= -1 && frame.right <= width + 1), 'Dock stays within the window');
        for (const frame of frames) assertTimelineInsidePlate(frame.timeline);
        const targetWidth = Math.min(1240, width - 192);
        const peakWidth = Math.max(...frames.map(frame => frame.width));
        assert.ok(peakWidth > targetWidth + 2 && peakWidth < targetWidth + (targetWidth - compact.width) * .06, `Expansion has one restrained bounce: ${JSON.stringify({ peakWidth, targetWidth })}`);
        const settled = frames[frames.findLastIndex(frame => Math.abs(frame.width - targetWidth) >= 1) + 1];
        assert.ok(settled && settled.at < 350, `Expansion must settle promptly: ${JSON.stringify(settled)}`);
        console.log(JSON.stringify({ viewport: width, settledMs: settled.at, frames: frames.length, longestFrameMs: Math.max(...frames.slice(1).map((frame, index) => frame.at - frames[index].at)) }));
        for (const frame of frames) for (const before of essentialBounds) {
            const after = frame.buttons.find(button => button.id === before.id);
            for (const axis of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(after[axis] - before[axis]) < 1, `${before.id} ${axis} moved during the dock morph`);
        }
        const expandedHandle = await handle.boundingBox();
        assert.deepEqual(expandedHandle, compactHandle, 'The right handle stays in the same place');
        assert.ok(await handleIsReachable(), 'Expanded dock leaves the right handle reachable');
        const overlapping = await bar.locator('button').evaluateAll(elements => {
            const buttons = elements.filter(element => element.getClientRects().length).map(element => ({ id: element.id || element.getAttribute('aria-label'), rect: element.getBoundingClientRect() }));
            return buttons.flatMap((button, index) => buttons.slice(index + 1).filter(other =>
                Math.min(button.rect.right, other.rect.right) - Math.max(button.rect.left, other.rect.left) > 1 &&
                Math.min(button.rect.bottom, other.rect.bottom) - Math.max(button.rect.top, other.rect.top) > 1
            ).map(other => `${button.id} / ${other.id}`));
        });
        assert.deepEqual(overlapping, [], 'Expanded buttons have separate hit targets');
        if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/dock-expanded-${width}.png` });

        await page.keyboard.press('Tab');
        await page.locator('#play-btn').focus();
        await page.mouse.move(20, 20);
        await page.waitForTimeout(1100);
        assert.equal(await bar.getAttribute('data-dock-state'), 'expanded', 'Keyboard focus keeps the dock open');
        await page.evaluate(() => { window.collectDockMotion(); document.activeElement.blur(); });
        await page.waitForFunction(() => document.querySelector('#bottom-bar')?.dataset.dockState === 'compact');
        await page.waitForFunction(() => Math.abs(document.querySelector('#bottom-bar').getBoundingClientRect().width - 460) < 1);
        await page.waitForTimeout(200);
        for (const frame of await page.evaluate(() => window.dockMotionFrames)) assertTimelineInsidePlate(frame.timeline);
        const slider = page.getByRole('slider', { name: 'Playback position' });
        const rail = await slider.boundingBox();
        await page.mouse.move(rail.x + rail.width / 4, rail.y + rail.height / 2);
        await page.mouse.down();
        const preview = Number(await slider.getAttribute('aria-valuenow'));
        await page.waitForTimeout(250);
        await page.mouse.up();
        const committed = await page.evaluate(() => window.shellCommands.filter(command => command.action === 'seek').at(-1)?.value);
        assert.ok(Math.abs(committed - preview) < 1, 'Expansion preserves a stationary pointer seek');
        await page.getByRole('button', { name: 'Restore player focus', exact: true }).click();
        await page.mouse.move(20, 80);
        await page.waitForTimeout(3300);
        assert.equal(await bar.getAttribute('data-dock-state'), 'compact', 'Focus restored by a pointer action must not pin the dock open indefinitely');
        await page.close();
    }
    await page.bringToFront();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`${baseUrl}/test/unit/mineradio/shellFixture.html?populated=true&compact=true`);
    await page.mouse.move(20, 20);
    await page.waitForFunction(() => document.querySelector('#bottom-bar')?.dataset.dockState === 'compact');
    await page.locator('#bottom-bar').hover();
    await page.waitForFunction(() => document.querySelector('#bottom-bar')?.dataset.dockState === 'expanded');
    assert.ok(await page.locator('#bottom-bar').evaluate(element => !element.style.transform || element.style.transform === 'none'), 'Reduced motion changes geometry without a spring transform');
    assert.deepEqual(errors, []);
    console.log(`MineRadio React shell smoke passed: ${process.env.DOCK_ONLY ? 'dock cases' : 'shared transport and six Home sizes'}, fixed essential controls, snappy compact/expanded dock, keyboard focus and reduced motion.`);
} finally {
    await browser?.close();
    await server?.close();
}
