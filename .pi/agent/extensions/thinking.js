// dotfiles/.pi/agent/extensions/thinking.ts
var THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"];
function normalizeLevel(value) {
  const level = value.trim().toLowerCase();
  if (THINKING_LEVELS.includes(level))
    return level;
  return;
}
function thinkingExtension(pi) {
  function setThinkingLevel(level, ctx) {
    pi.setThinkingLevel(level);
    ctx.ui.notify(`Thinking level set to ${level}`, "info");
  }
  pi.registerCommand("thinking", {
    description: "Set the model thinking level",
    handler: async (args, ctx) => {
      const input = (args || "").trim();
      if (input) {
        const level = normalizeLevel(input);
        if (!level) {
          ctx.ui.notify(`Unknown thinking level: ${input}`, "warning");
          return;
        }
        setThinkingLevel(level, ctx);
        return;
      }
      if (!ctx.hasUI) {
        ctx.ui.notify(`Current thinking level: ${pi.getThinkingLevel()}`, "info");
        return;
      }
      const choice = await ctx.ui.select("Select thinking level", [...THINKING_LEVELS]);
      if (choice)
        setThinkingLevel(choice, ctx);
    }
  });
}
export {
  thinkingExtension as default
};
