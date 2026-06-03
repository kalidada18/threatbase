# UI/UX Enhancement Plan (Themes & Icons)

This plan outlines the steps to introduce a pristine Light Mode, enhance the color vibrance of the current Dark Mode, and improve the usage of Lucide icons across the application.

## Goal Description
Enhance the existing premium design by injecting more vibrant neon accents and fully supporting a togglable "White Mode" (Light Mode) that retains the glassmorphism aesthetic while feeling bright and airy. Add more contextual icons to tables, stats, and the search bar.

## Proposed Changes

### 1. CSS Theme Variables
- **Dark Mode (Default):** Enhance the current deep blue colors with slightly more vibrant accent glows (e.g., brighter crimson, neon emerald).
- **Light Mode (`.light-mode`):** Create a completely new variable set overriding `:root`. 
  - Background: Soft airy white/silver mesh gradients.
  - Cards: Semi-transparent white glass panels (`rgba(255, 255, 255, 0.7)`).
  - Text: Deep ink/slate for high readability.

### 2. Theme Toggle Switch
- Add a beautiful sun/moon toggle switch icon to the top right of the navigation bar in `index.html`.
- Wire up the toggle in `script.js` to switch classes on the `<body>` tag and save the user's preference in `localStorage`.

### 3. Iconography Enhancements
- Inject `lucide` icons into:
  - The hero search bar (a search icon on the left, an arrow on the button).
  - The stat cards (Shield, Activity, Globe, Database icons).
  - The "Scan" progress steps.
  - The tabs for the IOC database.

## Open Questions

> [!TIP]
> The light mode will use a beautiful "frosted white glass" effect over a vibrant, light mesh background. Does this align with your vision for "White Mode"?
