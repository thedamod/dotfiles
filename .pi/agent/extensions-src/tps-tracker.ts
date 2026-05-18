import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type ActiveMessage = {
	startedAt: number;
	lastAt: number;
	lastText: string;
	lastThinking: string;
	estimatedTokens: number;
	estimatedThinkingTokens: number;
};

function textFromContent(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";

	return content
		.map((part) => {
			if (typeof part === "string") return part;
			if (part && typeof part === "object" && "text" in part) {
				const text = (part as { text?: unknown }).text;
				return typeof text === "string" ? text : "";
			}
			return "";
		})
		.join("");
}

function thinkingFromContent(content: unknown): string {
	if (!Array.isArray(content)) return "";

	return content
		.map((part) => {
			if (part && typeof part === "object" && "type" in part && (part as { type?: unknown }).type === "thinking") {
				const thinking = (part as { thinking?: unknown }).thinking;
				return typeof thinking === "string" ? thinking : "";
			}
			return "";
		})
		.join("");
}

function outputTokensFromUsage(message: unknown): number | undefined {
	if (!message || typeof message !== "object") return undefined;
	const usage = (message as { usage?: Record<string, unknown> }).usage;
	if (!usage || typeof usage !== "object") return undefined;

	const candidates = [usage.outputTokens, usage.completionTokens, usage.completion_tokens, usage.output_tokens, usage.generatedTokens];
	for (const value of candidates) {
		if (typeof value === "number" && Number.isFinite(value)) return value;
	}
	return undefined;
}

function formatRate(tokens: number, elapsedMs: number): string {
	const seconds = Math.max(elapsedMs / 1000, 0.001);
	return (tokens / seconds).toFixed(1);
}

function formatStatus(state: ActiveMessage): string {
	const elapsed = Date.now() - state.startedAt;
	const output = `${formatRate(state.estimatedTokens, elapsed)} est`;
	const thinking = state.estimatedThinkingTokens > 0 ? ` · thinking ${formatRate(state.estimatedThinkingTokens, elapsed)} est` : "";
	return `TPS: ${output}${thinking}`;
}

export default function tpsTracker(pi: ExtensionAPI) {
	let active: ActiveMessage | undefined;

	pi.on("message_start", async (event, ctx) => {
		if (event.message.role !== "assistant") return;

		active = {
			startedAt: Date.now(),
			lastAt: Date.now(),
			lastText: textFromContent((event.message as { content?: unknown }).content),
			lastThinking: thinkingFromContent((event.message as { content?: unknown }).content),
			estimatedTokens: 0,
			estimatedThinkingTokens: 0,
		};

		ctx.ui.setStatus("tps", "TPS: starting…");
	});

	pi.on("message_update", async (event, ctx) => {
		if (event.message.role !== "assistant") return;

		let state = active;
		if (!state) {
			state = { startedAt: Date.now(), lastAt: Date.now(), lastText: "", lastThinking: "", estimatedTokens: 0, estimatedThinkingTokens: 0 };
			active = state;
		}

		const content = (event.message as { content?: unknown }).content;
		const text = textFromContent(content);
		const thinking = thinkingFromContent(content);

		const deltaChars = Math.max(0, text.length - state.lastText.length);
		if (deltaChars > 0) {
			state.estimatedTokens += deltaChars / 4;
			state.lastText = text;
		}

		const thinkingDeltaChars = Math.max(0, thinking.length - state.lastThinking.length);
		if (thinkingDeltaChars > 0) {
			state.estimatedThinkingTokens += thinkingDeltaChars / 4;
			state.lastThinking = thinking;
		}

		state.lastAt = Date.now();
		ctx.ui.setStatus("tps", formatStatus(state));
	});

	pi.on("message_end", async (event, ctx) => {
		if (event.message.role !== "assistant") return;

		const state = active;
		const elapsed = state ? Date.now() - state.startedAt : 0;
		const usageTokens = outputTokensFromUsage(event.message);
		const tokens = usageTokens ?? state?.estimatedTokens ?? 0;
		const thinkingTokens = state?.estimatedThinkingTokens ?? 0;
		const suffix = usageTokens === undefined ? " est" : "";
		const thinkingSuffix = thinkingTokens > 0 ? ` · thinking ${formatRate(thinkingTokens, elapsed)} est` : "";

		ctx.ui.setStatus("tps", `TPS: ${formatRate(tokens, elapsed)}${suffix}${thinkingSuffix}`);

		if (tokens > 0 || thinkingTokens > 0) {
			ctx.ui.notify(
				`Generated ${Math.round(tokens)} token${Math.round(tokens) === 1 ? "" : "s"}${thinkingTokens > 0 ? `, thinking ${Math.round(thinkingTokens)} token${Math.round(thinkingTokens) === 1 ? "" : "s"}` : ""} in ${(elapsed / 1000).toFixed(2)}s.`,
				"info",
			);
		}
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		ctx.ui.setStatus("tps", undefined);
	});
}
