import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import en from '@/i18n/locales/en';
import zh from '@/i18n/locales/zh-CN';
import id from '@/i18n/locales/in';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BeatEffectsGroup from '@/components/visualizer/BeatEffectsGroup';
import { getVisualizerRegistryEntry } from '@/components/visualizer/registry';
it('provides every Home and Dock label in all shipped locales', () => {
    const source = ['MineradioHome', 'MineradioDock'].map(name => readFileSync(`src/integrations/mineradio/${name}.tsx`, 'utf8')).join('\n');
    for (const [, suffix] of source.matchAll(/text\('([^']+)'/g)) {
        for (const locale of [en, zh, id]) expect((locale.options as Record<string, string>)[`mineradio${suffix}`], suffix).toBeTruthy();
    }
});
it('shows the MineRadio analysed-accent setting in every shipped locale', () => {
    const effects = getVisualizerRegistryEntry('mineradio').beatEffects;
    for (const locale of [en, zh, id]) {
        const options = locale.options as Record<string, string>;
        const html = renderToStaticMarkup(React.createElement(BeatEffectsGroup, {
            effects, t: key => options[key.replace('options.', '')] ?? key,
        }));
        expect(html).not.toContain('options.beatEffect_mineradio');
        expect(options.beatEffect_mineradioPulse).toBeTruthy();
        expect(options.beatEffect_mineradioPulseDesc).toBeTruthy();
        expect(html).toContain(options.beatEffect_mineradioPulse);
    }
});
