# Global Codex instructions

## Plan artifacts

When writing a plan, audit, roadmap, proposal, strategy note, or implementation spec, use the global `plan-docs` skill. Create a self-contained HTML artifact at `/tmp/plans/<plan-slug>/plan.html`, then upload it from that directory:

```bash
cd /tmp/plans/<plan-slug>
bunx postplan upload ./plan.html
```

Use the skill for the shared palette, dark-mode behavior, print styles, and restrained document rules. Report the local path and upload result. Do not write markdown plans as the primary artifact unless explicitly requested.
