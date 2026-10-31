// An active deck may still emit events from its previous URL while a new recording loads.
export function acknowledgesMediaSource(element: Pick<HTMLMediaElement, 'currentSrc'>, source: string | null | undefined, base: string): boolean {
    if (!source || !element.currentSrc) return false;
    try { return element.currentSrc === new URL(source, base).href; }
    catch { return false; }
}
