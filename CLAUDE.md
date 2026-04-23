# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: SVG HTML/Web Optimizer

A single-page web tool that imports raw SVG code (e.g., from Adobe Illustrator), optimizes it for HTML/web use, and exports clean SVG or rasterized PNG. No build step, no framework -- open `index.html` directly in a browser.

## Architecture

**Four source files compose the entire app:**

| File | Lines | Role |
|---|---|---|
| `index.html` | ~242 | Structural shell: preview area, import/export panels, resize floating panel. All UI icons use `<use href="#icon-*">` referencing the sprite injected by the icons file. |
| `script.js` | ~1929 | All application logic. Single procedural file with `window.*` exports for onclick handlers. |
| `style.css` | ~340 | Dark-theme design system using CSS custom properties (`:root` vars). No inline styles in HTML. |
| `ICONS (linked).js` | ~274 | Injects an SVG sprite sheet (`<svg style="display:none">`) into the DOM at load. Raw SVGs are pasted between comment blocks and parsed at runtime. |

**Auxiliary files:**

- `colorPicker.html` (~917 lines) -- Self-contained color/gradient picker loaded in a full-screen transparent iframe (`cpIframe`). Communicates with the parent via `postMessage`. Supports solid colors, linear/radial gradients, and an eyedropper tool.
- `_BACKUPS/` -- Numbered snapshot folders (manual version control). The root files are always the working copy.
- `Prompts/` -- Developer prompt notes; not consumed by the app.
- `assets/` -- Static assets (icons, images); not directly referenced by the core app.

## Data Flow

1. **Import** -- User pastes SVG or selects a `.svg` file. `processSVG()` parses it, inlines `<style>` class rules onto elements as presentation attributes, strips non-essential attributes/tags, normalizes path data, and stores the result in `globalOptimizedSvg`.
2. **Layers Panel** -- `buildLayersPanel()` reads `globalOptimizedSvg` and generates per-shape layer cards with controls for fill, stroke, opacity, stroke-width, and visibility. Each shape is tracked by `data-pf-index`.
3. **Render** -- `renderOutput()` clones `globalOptimizedSvg`, applies color mode (mono/local) and visibility state, updates the preview and export textarea. The `isScrubbing` flag skips expensive serialization during slider drags.
4. **Export** -- SVG mode copies serialized output; PNG mode rasterizes via an offscreen `<canvas>` with configurable dimensions, background, and clip-to-ink-bounds.

## Key Globals & State

- `globalOptimizedSvg` / `globalOriginalSvg` -- The live-edited and pristine-original SVG DOM nodes.
- `colorMode` -- `'mono'` (currentColor) or `'local'` (preserve original fills/strokes).
- `zoomMode` -- `'fit'` (scale to container) or `'size'` (native pixel size).
- `isLinkedMode` -- When true, layer color edits propagate to all shapes with the same original color.
- `resizeState` / `resizeHistory` -- Artboard/ink-bounds dimensions with undo/redo stack.
- `cpActiveCallback` -- Callback from the color picker iframe; `null` when picker is closed.

## Color Picker Communication Protocol

The parent and `colorPicker.html` iframe talk via `postMessage`:
- Parent -> iframe: `{ action: 'open', data, isGradient }` to launch picker.
- Iframe -> parent: `'update'` (live preview), `'confirm'`, `'cancel'`, `'cpState'` (hit-test rects), `'eyedropperToggle'`.
- The parent dynamically toggles `cpIframe.style.pointerEvents` between `'auto'` and `'none'` based on mouse position vs. the picker's reported modal rects, enabling click-through to the SVG preview behind the transparent iframe.

## Ink Wrapper System

`ensureInkWrapper()` wraps all shape content in a `<g id="ink-wrapper">` with `data-pf-sx/sy/tx/ty` attributes tracking scale and translation. The resize panel manipulates these to independently scale/reposition ink bounds relative to the artboard (viewBox). On export, these data attributes are stripped and the transform is baked in.

## Conventions

- **No build tools.** All edits are to raw source files.
- **No inline styles in HTML.** All styling via `style.css` classes and CSS custom properties.
- **Icon pattern:** Add SVGs to `ICONS (linked).js` between named comment blocks. Reference in HTML as `<svg class="icon-svg"><use href="#icon-name"></use></svg>`.
- **Handler pattern:** Functions called from `onclick` attributes must be assigned to `window.*` in `script.js`.
- **Surgical edits only.** These are dense files. Do not refactor/rewrite existing functions unless explicitly asked. Insert, modify, or delete only the lines needed.
- **Always use `/plan` before editing `index.html` or `script.js`** due to file density.
- **`isScrubbing` flag:** Pass `true` during continuous input (slider drags, scrub labels) to defer serialization and PNG regeneration. Pass `false` on pointerup/final commit.
- **Manual backups.** There is no git. Before large changes, the user may copy files to `_BACKUPS/`.
