import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type ActiveMessage = {
  startedAt: number;
  lastAt: number;
  lastText: string;
  estimatedTokens: number;
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

function outputTokensFromUsage(message: unknown): number | undefined {
  if (!message || typeof message !== "object") return undefined;
  const usage = (message as { usage?: Record<string, unknown> }).usage;
  if (!usage || typeof usage !== "object") return undefined;

  const candidates = [
    usage.outputTokens,
    usage.completionTokens,
    usage.completion_tokens,
    usage.output_tokens,
    usage.generatedTokens,
  ];

  for (const value of candidates) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }

  return undefined;
}

function formatRate(tokens: number, elapsedMs: number): string {
  const seconds = Math.max(elapsedMs / 1000, 0.001);
  return (tokens / seconds).toFixed(1);
}

export default function tpsTracker(pi: ExtensionAPI) {
  let active: ActiveMessage | undefined;

  pi.on("message_start", async (event, ctx) => {
    if (event.message.role !== "assistant") return;

    active = {
      startedAt: Date.now(),
      lastAt: Date.now(),
      lastText: textFromContent((event.message as { content?: unknown }).content),
      estimatedTokens: 0,
    };

    ctx.ui.setStatus("tps", "TPS: starting…");
  });

  pi.on("message_update", async (event, ctx) => {
    if (event.message.role !== "assistant") return;

    let state = active;
    if (!state) {
      state = {
        startedAt: Date.now(),
        lastAt: Date.now(),
        lastText: "",
        estimatedTokens: 0,
      };
      active = state;
    }

    const text = textFromContent((event.message as { content?: unknown }).content);
    const deltaChars = Math.max(0, text.length - state.lastText.length);
    if (deltaChars > 0) {
      // Cheap cross-provider fallback: ~4 chars/token for live display.
      state.estimatedTokens += deltaChars / 4;
      state.lastText = text;
      state.lastAt = Date.now();
    }

    const elapsed = Date.now() - state.startedAt;
    ctx.ui.setStatus("tps", `TPS: ${formatRate(state.estimatedTokens, elapsed)} est`);
  });

  pi.on("message_end", async (event, ctx) => {
    if (event.message.role !== "assistant") return;

    const state = active;
    const elapsed = state ? Date.now() - state.startedAt : 0;
    const usageTokens = outputTokensFromUsage(event.message);
    const tokens = usageTokens ?? state?.estimatedTokens ?? 0;
    const suffix = usageTokens === undefined ? " est" : "";

    ctx.ui.setStatus("tps", `TPS: ${formatRate(tokens, elapsed)}${suffix}`);

    if (tokens > 0) {
      ctx.ui.notify(
        `Generated ${Math.round(tokens)} token${Math.round(tokens) === 1 ? "" : "s"} in ${(elapsed / 1000).toFixed(2)}s (${formatRate(tokens, elapsed)} TPS${suffix}).`,
        "info",
      );
    }
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    ctx.ui.setStatus("tps", undefined);
  });
}
