---
name: html-plan-docs
description: Generate clean HTML plan documents — strategy notes, product specs, implementation plans, proposals, or brief write-ups with restrained human-designed UI. Use when the user asks for a standalone HTML plan or spec document, a structured write-up rendered as HTML, or a single-purpose planning/spec tool with quiet, professional design.
---

# HTML Plan Docs

## Purpose

Build a small app whose whole job is to collect structured plan/spec content and render a clean HTML document. Keep the app simple enough to inspect and share quickly.

Create new plan-doc projects under the caller's current repository in `./plan/<plan-slug>/` unless the user gives a different path. The `./plan` directory is the default home for these generated planning artifacts, so the app, source files, generated HTML export, and notes stay together instead of being scattered through the main application.

## Recommended App Shape

Create one focused app, not a platform.

Structure:
- A data layer with types for documents and sections.
- An editable form/interface for collecting structured content (title, summary, audience, status, sections with ordering).
- A rendered HTML output — either a live preview, an exported standalone HTML file, or both.
- A static `dist/index.html` or `document.html` output path alongside the source.

Data model:
- **Document**: title, summary, audience, status, date, owner.
- **Sections**: document ID, title, body, order, kind (e.g. text, table, callout).
- Queries: list documents, read one document with ordered sections.
- Mutations: create document, update metadata, add/update/reorder/delete sections.

## UI Rules

Build a quiet work surface.

- Use a fixed, ordinary left sidebar only when multiple saved documents need navigation.
- Use a simple header row with the document title, save state, and export actions.
- Use a two-column editor/preview layout for desktop.
- Use a single-column editor with preview toggle on mobile.
- Use normal controls: text inputs, textareas, select menus, simple buttons.
- Use 6px to 8px radii. Avoid pill buttons unless the control is naturally compact.
- Use 1px borders, flat surfaces, restrained hover states, and no decorative shadows.
- Do not add hero sections, eyebrow labels, gradient text, glass panels, fake metrics, decorative blobs, or explanatory filler cards.
- Do not make section notes that explain the UI. The interface should be self-evident.
- Keep transitions to color or opacity at 100ms to 160ms. Do not animate transforms for normal hover states.

## Color System

Use these colors directly when a palette is needed:

```css
:root {
  --background: #fcfcfc;
  --foreground: #141414f0;
  --surface-1: #fcfcfc;
  --surface-2: #f8f8f8;
  --surface-3: #f3f3f3;
  --surface-4: #ededed;
  --border: #14141414;
  --input: #1414141f;
  --hover: #1414140a;
  --active: #14141414;
  --primary: #abc4ff;
  --primary-foreground: #141414f0;
  --muted-foreground: #1414148a;
  --success: #0f7b6c;
  --warning: #dfab01;
  --danger: #cf2d56;
  --radius: 6px;
}

.dark {
  --background: #141414;
  --foreground: #e4e4e4eb;
  --surface-1: #141414;
  --surface-2: #181818;
  --surface-3: #1d1d1d;
  --surface-4: #222222;
  --border: #e4e4e414;
  --input: #e4e4e41f;
  --hover: #e4e4e40a;
  --active: #e4e4e414;
  --primary: #abc4ff;
  --primary-foreground: #191919;
  --muted-foreground: #e4e4e45e;
  --success: #4dab9a;
  --warning: #ffdc49;
  --danger: #fc6b83;
  --radius: 8px;
}
```

Do not let the blue accent dominate. Use it for focus rings, primary actions, and sparse highlights only. Prefer neutral surfaces and readable contrast.

**Important: never hardcode color values in CSS selectors.** Every color, background, border, or text color must use a `var(--...)` reference so that the `.dark` theme switch affects every element. Hardcoded hex values in rule blocks break dark mode and will not be caught by a visual check in a single theme.

## Theme Activation

The `.dark` class must be activated at runtime. Every generated HTML document must include a small inline script that:

1. **Reads system preference** via `window.matchMedia('(prefers-color-scheme: dark)')` as the default.
2. **Checks localStorage** for an explicit user override (`theme` key storing `"dark"` or `"light"`).
3. **Applies the `.dark` class** to `<html>` based on: explicit choice if set, otherwise system preference.
4. **Provides a toggle button** in the topbar (next to Print) that switches between light and dark, persists the choice to localStorage, and updates the `<html>` class.
5. **Listens for the `D` key** (when no input/textarea/select is focused) to toggle the theme, matching the toggle button behavior.
6. **Listens for `change` on the system preference media query** to update when the user changes their OS-level setting, but only when no explicit localStorage override exists.

Include this as a self-contained `<script>` block before `</head>` (or immediately after `<body>`) so the theme is applied before first paint (no flash of wrong theme):

```html
<script>
  (function() {
    var stored = localStorage.getItem('theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (stored === 'dark' || (!stored && prefersDark)) {
      document.documentElement.classList.add('dark');
    }
  })();
</script>
```

And a second script at the end of `<body>` for the interactive toggle and keyboard listener:

```html
<script>
  (function() {
    var html = document.documentElement;
    var btn = document.getElementById('theme-toggle');
    function setTheme(theme) {
      if (theme === 'dark') { html.classList.add('dark'); }
      else { html.classList.remove('dark'); }
      localStorage.setItem('theme', theme);
    }
    function toggleTheme() {
      setTheme(html.classList.contains('dark') ? 'light' : 'dark');
    }
    if (btn) { btn.addEventListener('click', toggleTheme); }
    document.addEventListener('keydown', function(e) {
      if (e.key === 'd' || e.key === 'D') {
        var tag = e.target.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          toggleTheme();
        }
      }
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
      if (!localStorage.getItem('theme')) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    });
  })();
</script>
```

Add the toggle button in the topbar alongside the Print button with muted styling that fits the restrained design language:

```html
<button class="theme-button" id="theme-toggle" type="button" aria-label="Toggle theme">
  <span class="theme-icon-light"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg></span>
  <span class="theme-icon-dark"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg></span>
</button>
```

Use sun (circle with rays) and moon (crescent) SVG outlines. Keep the button style consistent with the Print button (same height, border, hover). Include the D-key hint as a `title` attribute. The button must change its background and border in dark mode so the theme state is visible at a glance.

Include these CSS rules for the toggle button and icon swap:

```css
.theme-button {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  min-height: 36px;
  border: 1px solid var(--input);
  border-radius: var(--radius);
  background: var(--background);
  color: var(--foreground);
  padding: 0;
  cursor: pointer;
  transition: color 140ms, background-color 140ms, border-color 140ms;
}
.theme-button:hover { background: var(--hover); }
.dark .theme-button { background: var(--surface-2); border-color: var(--hover); }
.theme-button svg { display: block; }
.theme-button .theme-icon-dark { display: none; }
.dark .theme-button .theme-icon-light { display: none; }
.dark .theme-button .theme-icon-dark { display: inline; }
```

## Document Output Standard

Generated HTML documents should be useful as artifacts.

- Include title, summary, owner/audience, date, and status.
- Keep a complete local HTML output alongside the source, even when the primary experience is served dynamically.
- Use a table of contents only when the document has enough sections to need it.
- Render sections in a single readable column with clear hierarchy.
- Use tables for comparisons, scope, risks, milestones, and decisions.
- Use callouts only for real constraints, decisions, risks, or open questions.
- Keep print styles simple: white background, dark text, hidden app controls.
- Avoid marketing copy. A plan document should sound direct and operational.

## Acceptance Checks

Before calling the work done:

1. The project lives under `./plan/<plan-slug>/` unless the user requested a different path.
2. Document queries and mutations are scoped to the current user (when user authentication is part of the app).
3. The UI can create, edit, preview, and export/view an HTML document.
4. A complete generated HTML document exists in the plan directory or is available through a documented HTML endpoint.
5. The app has no generic dashboard filler, fake charts, decorative gradients, or oversized rounded panels.
6. The rendered document is readable on mobile and printable.
7. The local dev server runs when local verification is requested.
8. The HTML export path and any deployed URL are reported in the final answer.
