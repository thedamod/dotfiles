---
name: plan-docs
description: Create polished, self-contained HTML plans, specs, proposals, audits, roadmaps, and strategy documents as temporary artifacts, then upload them with postplan.
---

# Plan documents

Use this skill whenever the model is about to write a plan, implementation plan, audit, proposal, roadmap, strategy note, product spec, or other structured planning artifact.

## Artifact workflow

1. Create a temporary directory at `/tmp/plans/<plan-slug>/`.
2. Write the complete artifact to `/tmp/plans/<plan-slug>/plan.html`.
3. Make the HTML self-contained: inline CSS, no required local assets, and readable without the chat transcript.
4. Upload it from its directory:

```bash
cd /tmp/plans/<plan-slug>
bunx postplan upload ./plan.html
```

5. Report the local path and the upload result or URL. If the upload fails, keep the HTML artifact and report the exact failure; do not silently fall back to a markdown-only plan.

Keep the entire response to a planning request in one `plan.html`, even when the document is long or contains several phases, workstreams, options, or related subplans. Do not split a plan into companion HTML files, create an HTML index, or use local `/.../...` links for sections: postplan uploads each HTML file separately and those links do not work as a single artifact. Use in-document fragment links (`#section-id`) for navigation. Create another HTML artifact only when the user explicitly asks for separate documents or when it is a genuinely different deliverable unrelated to the planning request. Do not create repository `plans/*.md` files unless the user explicitly requests that legacy format.

## Document structure

Every plan should be direct and operational. Include the parts that apply:

- Title, one-sentence summary, owner or audience, date, and status.
- Context and the problem being solved.
- Current-state evidence with exact file paths and line references when code is involved.
- Goals, non-goals, scope boundaries, and assumptions.
- Ordered implementation steps with concrete file changes.
- Verification commands and expected results for each meaningful step.
- Tests, acceptance criteria, risks, dependencies, rollback or escape hatches, and maintenance notes.
- A decision table, comparison table, milestone table, or risk table when it improves scanning.
- A table of contents only when the document has enough sections to need one.

Use semantic HTML (`header`, `main`, `section`, `article`, `table`, `aside`, `pre`, and `code`). Keep code excerpts short and relevant. Never include secrets.

## Visual system

Build a quiet work surface and a readable artifact:

- Neutral surfaces, 1px borders, restrained hover states, and 6px to 8px radii.
- No hero sections, eyebrow labels, gradient text, glass panels, fake metrics, decorative blobs, filler cards, marketing copy, or oversized rounded panels.
- Use a single readable content column. Use tables for comparisons, scope, risks, milestones, and decisions; use callouts only for real constraints, decisions, risks, or open questions.
- Use transitions only for color or opacity, normally 100ms to 160ms. Do not animate transforms for ordinary hover states.
- Sentence case throughout. Keep typography legible on mobile.
- Do not add a utility header or topbar with Print or theme controls. The document title and metadata may use a normal semantic `header` inside the content column.

Use this dark-only token palette:

```css
:root {
  color-scheme: dark;
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

Never hardcode a color inside a CSS rule. Every background, foreground, border, input, hover, active, and semantic color must use a `var(--...)` token. Do not define light-theme tokens, `.dark` overrides, `prefers-color-scheme` rules, localStorage theme state, or theme-toggle JavaScript. The document is always dark. Do not let the blue accent dominate; reserve it for focus rings, primary actions, and sparse highlights.

## Quality gate

Before uploading, verify that:

- The file exists at the expected `/tmp/plans/<plan-slug>/plan.html` path.
- It opens as one complete, self-contained HTML document with title, metadata, and all content for the request.
- It contains no companion-document navigation, Print button, theme button, light palette, or theme-switching script.
- All colors use the dark-only tokens.
- The document is readable at narrow widths.
- Every command and acceptance check is concrete enough for another agent to execute.
- The upload command has been run and its result is reported.
