# MaurMaket Design System Revamp

This branch is the foundation for the application-wide UX/UI revamp.

## Product principles

- MaurMaket should feel like one coherent product across every route.
- Image-first commerce; price, availability, seller identity, and trust remain visible.
- One clear primary action per screen.
- Progressive disclosure: one important decision at a time.
- Personal identity and seller/store identity are distinct concepts.
- Seller tools should feel like a dedicated workspace, not random account settings.
- Settings are grouped by user intent and remain visually consistent with the rest of the app.
- Empty, loading, error, success, and offline states are first-class UX states.
- Touch targets should be comfortably usable; primary actions should generally meet 44px+ targets.
- Shared tokens, headers, spacing, radii, typography, surfaces, navigation, and transitions should prevent route-to-route visual discontinuity.

## Screen standards

Define reusable screen archetypes before migrating individual routes:

- Standard/list screen
- Detail screen
- Form/edit screen
- Hub/workspace screen
- Map/location screen
- Sheet/modal

Each archetype should share safe-area handling, header geometry, content padding, typography hierarchy, action placement, loading behavior, and transition language.

## Navigation

Primary shell: Feed, Explore, central action/Inbox, Map, Me.

The floating navigation treatment should remain part of the visual language while its dimensions and offsets become shared tokens rather than screen-specific assumptions.

## Map/native-feel investigation

MapScreen currently uses a WebView/Leaflet architecture and has required fixes around initialization races, local Leaflet bundling, GPS centering, marker injection, and command retries. Before further visual polish, benchmark perceived latency and interaction responsiveness. If the WebView bridge remains the bottleneck, evaluate a native map implementation rather than endlessly compensating for bridge latency.

## Onboarding defaults

Onboarding should establish defaults such as payment and fulfillment preferences without making them permanent. Users must be able to change those choices later through Settings.

## Migration strategy

1. ✅ Formalize design tokens — DONE (src/theme.ts expanded with 26 colors, typography scale, spacing, radii, shadows, icons, touch targets, motion, layout tokens)
2. ✅ Build the shared application shell — DONE (ScreenContainer, ScreenHeader v2, BackButton v2 using design tokens)
3. ✅ Build reusable screen primitives — DONE (EmptyState, Skeleton, Toast, LoadingState updated with design tokens)
4. ✅ Standardize navigation transitions — DONE (App.tsx uses DURATION, LAYOUT, RADIUS, SHADOW, ICON_SIZES tokens)
5. ✅ Establish screen archetypes — DONE (ListScreen, FormSheet, CardRow components)
6. Resolve Map interaction architecture.
7. Migrate screens group-by-group instead of redesigning routes independently.
