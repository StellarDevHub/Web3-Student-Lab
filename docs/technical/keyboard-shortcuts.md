# Keyboard Shortcuts

This feature adds a global keyboard shortcut system to the Web3 Student Lab frontend. The implementation is designed to be accessible, discoverable, and easy to extend.

## How It Works

- `hotkeys-js` is used to register global shortcut listeners in a client-side provider.
- Shortcuts are grouped into categories such as navigation, playground actions, and general actions.
- The provider renders a help modal that lists all available shortcuts and keyboard combinations.
- The Playground page listens for a custom event to execute compilation from a shortcut.

## Available Shortcuts

- `Ctrl/Cmd + K` — Open shortcut help panel
- `G + C` — Navigate to the course catalog
- `G + R` — Navigate to the roadmap
- `G + V` — Navigate to the verification center
- `G + D` — Navigate to the dashboard
- `Ctrl/Cmd + Shift + T` — Toggle between light and dark theme
- `Ctrl/Cmd + Shift + H` — Open the shortcut help panel
- `Ctrl/Cmd + Shift + C` — Compile code in the playground (when on the playground page)

## Accessibility Notes

- The help modal is built with semantic dialog markup and descriptive labels.
- Shortcut bindings are disabled when typing in form fields or content editable regions.
- Errors during binding are caught and logged to avoid breaking the application.

## Extension Guide

To add a new shortcut:

1. Add a new entry in `frontend/src/components/keyboard/KeyboardShortcutsProvider.tsx`.
2. Add a corresponding route or action handler in the provider.
3. Update the help modal if the new shortcut should be discoverable.
