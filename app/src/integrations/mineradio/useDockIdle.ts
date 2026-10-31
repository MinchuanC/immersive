import { useEffect, useRef, useState, type FocusEventHandler, type PointerEventHandler } from 'react';

// Keep the player dock available as compact essentials until somebody interacts with it.
export const useDockIdle = (enabled: boolean, heldOpen = false) => {
    const [compact, setCompact] = useState(false);
    const state = useRef({ enabled, heldOpen, compact: false, hovered: false, focused: false, keyboardFocus: false, pointerDown: false, pressed: false, leaving: false, timer: undefined as number | undefined });
    state.current.enabled = enabled;
    state.current.heldOpen = heldOpen;
    const clearTimer = () => {
        window.clearTimeout(state.current.timer);
        state.current.timer = undefined;
    };
    const reveal = () => {
        clearTimer();
        if (!state.current.compact) return;
        state.current.compact = false;
        setCompact(false);
    };
    const schedule = (delay: number) => {
        clearTimer();
        const current = state.current;
        if (!current.enabled || current.heldOpen || current.hovered || current.keyboardFocus || current.pressed || current.compact) return;
        current.timer = window.setTimeout(() => {
            current.timer = undefined;
            current.compact = true;
            setCompact(true);
        }, delay);
    };
    const onPointerEnter: PointerEventHandler<HTMLElement> = () => {
        state.current.hovered = true;
        state.current.leaving = false;
        reveal();
    };
    const onPointerLeave: PointerEventHandler<HTMLElement> = () => {
        state.current.hovered = false;
        state.current.leaving = true;
        schedule(100);
    };
    const onPointerDownCapture: PointerEventHandler<HTMLElement> = () => {
        state.current.pressed = true;
        state.current.pointerDown = true;
        state.current.keyboardFocus = false;
        reveal();
    };
    const onFocusCapture: FocusEventHandler<HTMLElement> = event => {
        state.current.focused = true;
        // Restored pointer focus must not acquire the keyboard's persistent visibility hold.
        state.current.keyboardFocus = !state.current.pointerDown && event.target.matches(':focus-visible');
        reveal();
        schedule(3000);
    };
    const onBlurCapture: FocusEventHandler<HTMLElement> = event => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
        state.current.focused = false;
        state.current.keyboardFocus = false;
        state.current.leaving = true;
        schedule(100);
    };
    useEffect(() => {
        if (!enabled) {
            reveal();
            Object.assign(state.current, { hovered: false, focused: false, keyboardFocus: false, pointerDown: false, pressed: false, leaving: false });
            return clearTimer;
        }
        if (heldOpen) reveal();
        else schedule(3000);
        const move = (event: PointerEvent) => {
            if (state.current.pressed && event.buttons === 0) release();
            if (!state.current.compact && !state.current.leaving) schedule(3000);
        };
        const down = () => {
            state.current.pointerDown = true;
            state.current.keyboardFocus = false;
            schedule(state.current.leaving ? 100 : 3000);
        };
        const release = () => {
            state.current.pointerDown = false;
            if (!state.current.pressed) return;
            state.current.pressed = false;
            schedule(100);
        };
        const blur = () => {
            Object.assign(state.current, { pressed: false, pointerDown: false, hovered: false, keyboardFocus: false, leaving: true });
            schedule(100);
        };
        const key = (event: KeyboardEvent) => {
            if (!state.current.focused || ['Alt', 'Control', 'Meta', 'Shift'].includes(event.key)) return;
            state.current.keyboardFocus = true;
            reveal();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerdown', down, true);
        window.addEventListener('pointerup', release, true);
        window.addEventListener('pointercancel', release, true);
        window.addEventListener('keydown', key, true);
        window.addEventListener('blur', blur);
        return () => {
            clearTimer();
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerdown', down, true);
            window.removeEventListener('pointerup', release, true);
            window.removeEventListener('pointercancel', release, true);
            window.removeEventListener('keydown', key, true);
            window.removeEventListener('blur', blur);
        };
    }, [enabled, heldOpen]);
    return { compact: enabled && !heldOpen && compact, onPointerEnter, onPointerLeave, onPointerDownCapture, onFocusCapture, onBlurCapture };
};
