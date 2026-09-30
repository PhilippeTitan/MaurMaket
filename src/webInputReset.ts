import { Platform } from 'react-native';

// ─────────────────────────────────────────────────────────────
// Browser chrome we do not draw, removed from our text fields
//
// Every text field in the app is a React Native Web <input> inside a pressable,
// tab-focusable wrapper that *is* the rounded field box the user sees. Two browser
// affordances land on top of that design and neither is ours:
//
//   1. The focus ring. RNW's base input style covers border, background and font but
//      leaves `outline` alone, so Chrome's own `:focus-visible` ring paints around
//      the focused input — and around the focusable wrapper that draws the field's
//      rounded box — in the operating system's accent colour. On a machine whose
//      accent is yellow/gold that reads as a yellow box drawn around every field the
//      user clicks or tabs into. The app already draws its own focus state (the violet
//      border and glow in `fieldFocused`), so the ring is not doing useful work.
//
//   2. The autofill highlight. Chrome fills a saved-credential field with its own
//      highlight colour, which overrides the dark surface these fields are built on.
//      The `transition` below is the standard way to keep that fill from painting:
//      the background colour is asked to animate for ten days, so it never arrives.
//
// Only text-entry targets are touched: buttons and links keep their browser focus
// ring, because the app does not draw one for them. Native is untouched.
// ─────────────────────────────────────────────────────────────

const STYLE_ID = 'mm-web-input-reset';

const CSS = `
/* Text-entry targets, in every focus state. */
input, textarea, select { outline: none !important; }
input:focus, input:focus-visible,
textarea:focus, textarea:focus-visible,
select:focus, select:focus-visible { outline: none !important; }

/* The pressable wrapper around a text field, when it is the element holding focus:
   that is the box the browser draws its ring around. It is an implementation detail
   (RNW renders it as role="presentation"), and the app's own focus styling appears as
   soon as the field's input takes focus — one Tab further on — so no ring is lost. */
[tabindex]:has(input):focus,
[tabindex]:has(input):focus-visible,
[tabindex]:has(textarea):focus,
[tabindex]:has(textarea):focus-visible { outline: none !important; }

/* Saved-credential autofill: leave our surface and text colours alone. */
input:-webkit-autofill,
input:-webkit-autofill:hover,
input:-webkit-autofill:focus,
input:-webkit-autofill:active {
  box-shadow: none !important;
  -webkit-text-fill-color: inherit;
  transition: background-color 600000s 0s, color 600000s 0s;
}
`;

/**
 * Install the field reset once, on web only. Safe to call repeatedly — it is keyed
 * by the style element's id, so a fast refresh reuses the tag instead of stacking them.
 */
export function installWebInputReset() {
  if (Platform.OS !== 'web') return;
  if (typeof document === 'undefined' || !document.head) return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

installWebInputReset();
