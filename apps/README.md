# NEXUS OS app modules

Each independently installable App Store app lives in its own JavaScript file in this folder.

## Current modules

- `store.js` — App Store catalog, install/uninstall flow, package persistence and verification.
- `clock.js` — Clock and stopwatch.
- `calendar.js` — Calendar.
- `colorstudio.js` — Color Studio.

## Module contract

Each file registers one module on `window.NexusAppModules`:

- `render()` returns that app's window content.
- `mount(windowElement, api)` attaches the app's event handlers and behavior.
- Optional `windowElement._cleanup` is called when the app window closes.

The OS shell remains responsible for desktop shortcuts, window management, taskbar behavior, app launching and shared system services. App-specific UI and behavior belong in the app's own file.

New App Store apps should follow this pattern instead of adding their full implementation to `index.html`.

Core built-in system apps are being migrated separately; until then, their existing implementation remains in `index.html`.
