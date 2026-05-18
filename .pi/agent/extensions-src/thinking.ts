import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
type ThinkingLevel = (typeof THINKING_LEVELS)[number];

function normalizeLevel(value: string): ThinkingLevel | undefined {
	const level = value.trim().toLowerCase();
	if (THINKING_LEVELS.includes(level as ThinkingLevel)) return level as ThinkingLevel;
	return undefined;
}

export default function thinkingExtension(pi: ExtensionAPI) {
	function setThinkingLevel(level: ThinkingLevel, ctx: any) {
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
			if (choice) setThinkingLevel(choice as ThinkingLevel, ctx);
		},
	});
}
