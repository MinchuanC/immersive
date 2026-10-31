import { expect, test } from './fixtures';

// Exercises the shared overlay's row order, missing alternatives and upcoming-line stack in a real browser.
test('stacks three rows in order and sizes following rows below the first', async ({ mount, page }) => {
    await mount('subtitleOverlayRows');
    const rows = page.locator('[data-subtitle-track]');

    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toHaveAttribute('data-subtitle-track', 'current');
    await expect(rows.nth(0)).toHaveText('おはよう');
    await expect(rows.nth(1)).toHaveText('ohayou');
    await expect(rows.nth(2)).toHaveText('早安');

    const boxes = await rows.evaluateAll(elements => elements.map(element => ({
        top: element.getBoundingClientRect().top,
        bottom: element.getBoundingClientRect().bottom,
        fontSize: parseFloat(getComputedStyle(element).fontSize),
    })));
    expect(boxes[0].bottom).toBeLessThanOrEqual(boxes[1].top + 1);
    expect(boxes[1].bottom).toBeLessThanOrEqual(boxes[2].top + 1);
    expect(boxes[1].fontSize).toBeLessThan(boxes[0].fontSize);
    expect(boxes[2].fontSize).toBe(boxes[1].fontSize);
});

test('omits unavailable alternatives without leaving empty rows', async ({ mount, page }) => {
    await mount('subtitleOverlayRows');
    const rows = page.locator('[data-subtitle-track]');

    await page.locator('[data-probe-line="romanizationOnly"]').click();
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1)).toHaveAttribute('data-subtitle-track', 'romanization');

    await page.locator('[data-probe-line="translationOnly"]').click();
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1)).toHaveAttribute('data-subtitle-track', 'translation');

    await page.locator('[data-probe-line="neither"]').click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute('data-subtitle-track', 'current');
});

test('shows the chosen single row and consumes two upcoming lines in order', async ({ mount, page }) => {
    await mount('subtitleOverlayRows');
    const rows = page.locator('[data-subtitle-track]');

    await page.locator('[data-probe-layout="translation"]').click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveText('早安');

    await page.locator('[data-probe-layout="romanization"]').click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveText('ohayou');

    await page.locator('[data-probe-layout="current+next+next"]').click();
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(1)).toHaveText('こんにちは');
    await expect(rows.nth(2)).toHaveText('こんばんは');
    await expect(rows.nth(1)).toHaveAttribute('data-subtitle-track', 'next');
    await expect(rows.nth(2)).toHaveAttribute('data-subtitle-track', 'next');
});
