import { createRequire } from "node:module";
var __require = /* @__PURE__ */ createRequire(import.meta.url);

// dotfiles/.pi/agent/extensions/yeet.ts
function modelLabel(model) {
  const displayName = model.name && model.name !== model.id ? ` — ${model.name}` : "";
  return `${model.provider}/${model.id}${displayName}`;
}
function parseSelectedModel(value) {
  const canonical = value.split(" — ")[0] ?? value;
  const slash = canonical.indexOf("/");
  if (slash === -1)
    return;
  return {
    provider: canonical.slice(0, slash),
    id: canonical.slice(slash + 1)
  };
}
function buildYeetPrompt(extraInstructions) {
  return [
    "You are running the /yeet git workflow for the user.",
    "",
    "Goal: inspect the repository, split the current working-tree changes into sensible incremental commits, ask the user which commit(s) to make, then push after the user approves.",
    "",
    "Required flow:",
    "1. Traverse the repo state using git commands. Start with `git status --short`, then inspect diffs with commands like `git diff`, `git diff --stat`, `git diff --cached`, and targeted file reads as needed.",
    "2. Identify logical groups of changes. Prefer small, reviewable commits. Do not mix unrelated changes in one commit.",
    "3. For each proposed commit, provide:",
    "   - a short title / commit message",
    "   - the exact files or hunks that belong in it",
    "   - a brief rationale",
    "   - any risk or uncertainty",
    "4. Ask the user to choose which proposed commit(s) to create before staging anything. If hunk-level staging is needed, explain it and ask before doing it.",
    "5. After the user chooses, stage only the selected files/hunks, create the commit(s) with the generated messages, and show the resulting commit hashes.",
    "6. Ask for final confirmation before pushing. Only run `git push` after explicit user confirmation.",
    "",
    "Rules:",
    "- Never commit secrets, auth files, API keys, tokens, sessions, histories, caches, node_modules, or ignored files.",
    "- Respect .gitignore and check suspicious files before staging.",
    "- If there are existing staged changes, preserve user intent and call them out before changing the index.",
    "- If tests/checks are relevant and cheap, suggest or run them before committing.",
    "- Be concise, but do not skip the user selection and push confirmation steps.",
    extraInstructions ? `
User-provided extra instructions:
${extraInstructions}` : ""
  ].filter(Boolean).join(`
`);
}
function yeet(pi) {
  let rememberedModel;
  pi.registerCommand("yeet", {
    description: "Start an AI-guided git commit/push workflow in a new chat. Usage: /yeet [extra instructions]",
    handler: async (args, ctx) => {
      await ctx.waitForIdle();
      const inside = await new Promise((resolve) => {
        import("node:child_process").then(({ execFile }) => {
          execFile("git", ["rev-parse", "--is-inside-work-tree"], { cwd: ctx.cwd }, (error, stdout) => {
            resolve(!error && stdout.trim() === "true");
          });
        }).catch(() => resolve(false));
      });
      if (!inside) {
        ctx.ui.notify("/yeet must be run inside a git repository.", "error");
        return;
      }
      const availableModels = await ctx.modelRegistry.getAvailable();
      if (availableModels.length === 0) {
        ctx.ui.notify("No models with configured auth are available for /yeet.", "error");
        return;
      }
      let model = rememberedModel ? ctx.modelRegistry.find(rememberedModel.provider, rememberedModel.id) : undefined;
      if (!model) {
        const labels = availableModels.map(modelLabel);
        const current = ctx.model ? modelLabel(ctx.model) : undefined;
        const selected = await ctx.ui.select("Choose model for /yeet commit planning", current ? [current, ...labels.filter((label) => label !== current)] : labels);
        if (!selected) {
          ctx.ui.notify("Yeet cancelled.", "info");
          return;
        }
        const parsed = parseSelectedModel(selected);
        model = parsed ? ctx.modelRegistry.find(parsed.provider, parsed.id) : undefined;
        if (!model) {
          ctx.ui.notify(`Could not resolve selected model: ${selected}`, "error");
          return;
        }
        rememberedModel = { provider: model.provider, id: model.id };
      }
      const modelSet = await pi.setModel(model);
      if (!modelSet) {
        ctx.ui.notify(`No API key available for ${modelLabel(model)}.`, "error");
        return;
      }
      const prompt = buildYeetPrompt(args.trim());
      const parentSession = ctx.sessionManager.getSessionFile();
      const result = await ctx.newSession({
        parentSession,
        withSession: async (nextCtx) => {
          nextCtx.ui.notify(`Starting /yeet with ${modelLabel(model)}...`, "info");
          await nextCtx.sendUserMessage(prompt);
        }
      });
      if (result.cancelled) {
        ctx.ui.notify("Yeet cancelled: new chat was not created.", "info");
      }
    }
  });
}
export {
  yeet as default
};
