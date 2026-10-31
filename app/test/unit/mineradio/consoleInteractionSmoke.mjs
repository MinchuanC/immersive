import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';

// Actual lyrics/background layering: a standalone iframe cannot expose host interception.
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, clearScreen: false });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
    for (const mode of ['classic', 'mineradio']) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        page.setDefaultTimeout(5000);
        await page.route('https://cdn.jsdmirror.cn/**', route => route.abort());
        await page.addInitScript(() => localStorage.setItem('i18nextLng', 'en'));
        await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/test/unit/mineradio/consoleFixture.html?mode=${mode}`);
        await page.getByRole('button', { name: 'Visual effects', exact: true }).click();
        const frame = page.frameLocator('iframe[title="MineRadio visual stage"]');
        await frame.locator('#fx-panel.peek').waitFor();
        const tab = frame.locator('[data-fx-tab="motion"]');
        await tab.evaluate(element => Promise.all(element.closest('#fx-panel').getAnimations().map(animation => animation.finished)));
        const bounds = await tab.boundingBox();
        const target = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
        const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, target);
        assert.equal(hit, 'IFRAME', 'Open console must be above the scrollable lyrics hit area');
        await page.mouse.click(target.x, target.y);
        assert.equal(await tab.getAttribute('aria-selected'), 'true', 'Pointer selects a real console tab');
        await frame.locator('[data-fx-tab="home"]').click();
        const presets = frame.locator('section[data-fx-console-group="presets"]');
        if (!await presets.evaluate(element => element.classList.contains('open'))) await presets.locator('.fx-fold-head').click();
        await frame.locator('#preset-grid [data-preset="9"]').click();
        assert.equal(await frame.locator('#preset-grid [data-preset="9"]').evaluate(element => element.classList.contains('active')), true, 'Selecting a background changes the current preset');
        await frame.getByRole('button', { name: 'Close visual console', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('[data-console-open]')?.dataset.consoleOpen === 'false', undefined, { polling: 50, timeout: 5000 });
        assert.equal(await page.getByRole('button', { name: 'Visual effects', exact: true }).evaluate(element => document.activeElement === element), true, 'Pointer close restores the opener');
        assert.equal(await page.getByLabel('Lyrics', { exact: true }).evaluate(element => element.closest('[inert]') !== null), false, 'Closing restores lyric interactions');
        await page.getByRole('button', { name: 'Visual effects', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('[data-console-open]')?.dataset.consoleOpen === 'true', undefined, { polling: 50, timeout: 5000 });
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => document.querySelector('[data-console-open]')?.dataset.consoleOpen === 'false', undefined, { polling: 50, timeout: 5000 });
        assert.equal(await frame.locator('#fx-panel').evaluate(element => element.classList.contains('show') || element.classList.contains('peek')), false);
        assert.equal(await page.getByRole('button', { name: 'Visual effects', exact: true }).evaluate(element => document.activeElement === element), true, 'Close restores the opener');
        await page.getByRole('button', { name: 'Visual effects', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('[data-console-open]')?.dataset.consoleOpen === 'true', undefined, { polling: 50, timeout: 5000 });
        if (mode === 'classic') await frame.locator('body').evaluate(() => window.__immersiveStage.dispose());
        else await page.getByRole('button', { name: 'Remove graphics', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('[data-console-open]')?.dataset.consoleOpen === 'false', undefined, { polling: 50, timeout: 5000 });
        await page.close();
        console.log(`MineRadio layered console interaction passed: ${mode} lyrics, tab/preset selection, Close, Escape, focus and ${mode === 'classic' ? 'iframe disposal' : 'unmount'} cleanup.`);
    }
} finally {
    await browser.close();
    await server.close();
}
