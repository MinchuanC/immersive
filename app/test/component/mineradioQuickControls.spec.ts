import { expect, test } from './fixtures';

test('MineRadio scene and mood controls work after the panel is reopened', async ({ mount, page }) => {
    await mount('mineradioQuickControls');
    const state = async () => JSON.parse((await page.locator('[data-probe-settings]').getAttribute('data-probe-settings'))!);
    const before = await state();

    await page.getByRole('button', { name: 'Surprise scene' }).click();
    const surprise = await state();
    expect(surprise.preset).not.toBe(before.preset);
    expect(surprise.cameraStateJson).toBe(before.cameraStateJson);

    await page.getByRole('button', { name: 'Vivid visual mood' }).click();
    expect((await state()).intensity).toBe(1.2);
    await page.getByRole('button', { name: 'Toggle controls' }).click();
    await page.getByRole('button', { name: 'Toggle controls' }).click();
    await page.getByRole('button', { name: 'Restore previous visual settings' }).click();
    expect((await state()).intensity).toBe(surprise.intensity);

    await page.getByRole('button', { name: 'Start scene tour' }).click();
    await page.getByRole('button', { name: 'Toggle controls' }).click();
    await page.getByRole('button', { name: 'Toggle controls' }).click();
    await expect(page.getByRole('button', { name: 'Stop scene tour' })).toBeVisible();
    await page.getByRole('button', { name: 'Stop scene tour' }).click();
    await expect(page.getByRole('button', { name: 'Start scene tour' })).toBeVisible();
});
