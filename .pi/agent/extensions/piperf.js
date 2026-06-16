// piperf.ts
function fmt(ms) {
  if (ms < 1000)
    return `${ms.toFixed(0)}ms`;
  if (ms < 60000)
    return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = ms % 60000 / 1000;
  return `${m}m ${s.toFixed(0)}s`;
}
function fmtTokens(n) {
  if (n < 1000)
    return n.toFixed(0);
  if (n < 1e4)
    return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1000).toFixed(0)}k`;
}
function textContent(content) {
  if (typeof content === "string")
    return content;
  if (!Array.isArray(content))
    return "";
  return content.map((p) => {
    if (typeof p === "string")
      return p;
    if (p?.text)
      return p.text;
    return "";
  }).join("");
}
function thinkingContent(content) {
  if (!Array.isArray(content))
    return "";
  return content.map((p) => {
    if (p?.type === "thinking" && p?.thinking)
      return p.thinking;
    return "";
  }).join("");
}
function getOutputTokens(msg) {
  const u = msg?.usage;
  if (!u)
    return null;
  for (const k of ["outputTokens", "completionTokens", "completion_tokens", "output_tokens", "generatedTokens"]) {
    if (typeof u[k] === "number")
      return u[k];
  }
  if (u.completion && typeof u.completion === "object") {
    if (typeof u.completion.tokenCount === "number")
      return u.completion.tokenCount;
  }
  return null;
}
function getThinkingTokens(msg) {
  const u = msg?.usage;
  if (!u)
    return null;
  if (typeof u.thinkingOutputTokens === "number")
    return u.thinkingOutputTokens;
  if (u.completion?.reasoningTokens && typeof u.completion.reasoningTokens === "number")
    return u.completion.reasoningTokens;
  if (typeof u.thinking === "number")
    return u.thinking;
  if (u.completionTokensDetails?.reasoningTokens && typeof u.completionTokensDetails.reasoningTokens === "number")
    return u.completionTokensDetails.reasoningTokens;
  return null;
}
function getCost(msg) {
  return msg?.usage?.cost?.total ?? 0;
}
function renderDashboard(m, theme) {
  const lines = [];
  lines.push(theme.fg("accent", theme.bold("╔═══ PI Performance ═══")));
  lines.push("");
  lines.push(`  ${theme.fg("muted", "Startup")}        ${m.startupMs > 0 ? fmt(m.startupMs) : theme.fg("dim", "—")}`);
  lines.push(`  ${theme.fg("muted", "Turns")}          ${m.turnCount}`);
  lines.push(`  ${theme.fg("muted", "Total tokens")}   ${fmtTokens(m.totalTokens)}` + (m.totalThinkingTokens > 0 ? `  ${theme.fg("dim", `(thinking ${fmtTokens(m.totalThinkingTokens)})`)}` : ""));
  lines.push(`  ${theme.fg("muted", "Total time")}     ${fmt(m.totalDurationMs)}`);
  if (m.totalCost > 0) {
    lines.push(`  ${theme.fg("muted", "Cost")}          $${m.totalCost.toFixed(4)}`);
  }
  lines.push("");
  if (m.turns.length === 0) {
    lines.push(`  ${theme.fg("dim", "No turns yet. Send a message to see per-turn metrics.")}`);
    lines.push(theme.fg("accent", theme.bold("╚═══════════════════════")));
    return lines;
  }
  const recent = m.turns.slice(-6);
  lines.push(`  ${theme.fg("accent", theme.bold("Recent Turns"))}`);
  lines.push(`  ${theme.fg("dim", "─── ─────── ────── ──────── ───────── ────")}`);
  lines.push(`  ${theme.fg("dim", "#  ")}` + `${theme.fg("dim", "TTFT    ")}` + `${theme.fg("dim", "TPS  ")}` + `${theme.fg("dim", "Tokens   ")}` + `${theme.fg("dim", "Model       ")}` + `${theme.fg("dim", "Time")}`);
  for (let i = 0;i < recent.length; i++) {
    const t = recent[i];
    const idx = m.turns.length - recent.length + i;
    const ttft = t.ttft !== null ? fmt(t.ttft).padStart(7) : "  —   ".padStart(7);
    const tps = t.tps !== null ? `${t.tps.toFixed(0).padStart(4)}` : "  — ";
    const tokens = fmtTokens(t.actualTokens ?? t.estTokens).padStart(7);
    const model = t.modelId.length > 12 ? t.modelId.slice(0, 10) + ".." : t.modelId.padEnd(12);
    const dur = fmt(t.duration).padStart(5);
    lines.push(`  ${String(idx + 1).padStart(2)} ${ttft} ${tps} ${tokens} ${model} ${dur}`);
  }
  lines.push("");
  const avgTtft = m.turns.reduce((a, t) => a + (t.ttft ?? t.duration), 0) / m.turns.length;
  const avgTps = m.turns.filter((t) => t.tps !== null).reduce((a, t) => a + t.tps, 0) / Math.max(1, m.turns.filter((t) => t.tps !== null).length);
  lines.push(`  ${theme.fg("muted", "Avg TTFT")}   ${fmt(avgTtft)}` + `    ${theme.fg("muted", "Avg TPS")}    ${avgTps.toFixed(1)}`);
  lines.push(theme.fg("accent", theme.bold("╚═══════════════════════")));
  return lines;
}
function piperf_default(pi) {
  const processStart = Date.now();
  let sessionMetrics = {
    startupMs: 0,
    turnCount: 0,
    totalTokens: 0,
    totalThinkingTokens: 0,
    totalDurationMs: 0,
    totalCost: 0,
    turns: []
  };
  let stream = null;
  pi.on("session_start", async (_event, ctx) => {
    sessionMetrics.startupMs = Date.now() - processStart;
    ctx.ui.setStatus("perf", `startup ${fmt(sessionMetrics.startupMs)}`);
  });
  pi.on("message_start", async (event, ctx) => {
    if (event.message.role !== "assistant")
      return;
    stream = {
      startedAt: Date.now(),
      firstTokenAt: null,
      lastText: textContent(event.message.content),
      lastThinking: thinkingContent(event.message.content),
      estimatedTokens: 0,
      estimatedThinking: 0
    };
    ctx.ui.setStatus("perf", `—  ${sessionMetrics.turnCount + 1} · — ttft`);
  });
  pi.on("message_update", async (event, ctx) => {
    if (event.message.role !== "assistant" || !stream)
      return;
    const text = textContent(event.message.content);
    const thinking = thinkingContent(event.message.content);
    const now = Date.now();
    if (stream.firstTokenAt === null && text.length > stream.lastText.length) {
      stream.firstTokenAt = now;
      ctx.ui.setStatus("perf", `${fmt(stream.firstTokenAt - stream.startedAt)} ttft · ${sessionMetrics.turnCount + 1}`);
    }
    const deltaChars = Math.max(0, text.length - stream.lastText.length);
    if (deltaChars > 0) {
      stream.estimatedTokens += deltaChars / 4;
      stream.lastText = text;
    }
    const deltaThinking = Math.max(0, thinking.length - stream.lastThinking.length);
    if (deltaThinking > 0) {
      stream.estimatedThinking += deltaThinking / 4;
      stream.lastThinking = thinking;
    }
    const elapsed = now - stream.startedAt;
    const tps = elapsed > 0 ? ((stream.estimatedTokens + stream.estimatedThinking) / (elapsed / 1000)).toFixed(0) : "—";
    const ttft = stream.firstTokenAt ? fmt(stream.firstTokenAt - stream.startedAt) : "—";
    ctx.ui.setStatus("perf", `${ttft} ttft · ${tps} tps  (turn ${sessionMetrics.turnCount + 1})`);
  });
  pi.on("message_end", async (event, ctx) => {
    if (event.message.role !== "assistant" || !stream)
      return;
    const end = Date.now();
    const actualTokens = getOutputTokens(event.message);
    const actualThinking = getThinkingTokens(event.message);
    const cost = getCost(event.message);
    const elapsed = end - stream.startedAt;
    const tokens = actualTokens ?? stream.estimatedTokens;
    const thinkTokens = actualThinking ?? stream.estimatedThinking;
    const ttft = stream.firstTokenAt ? stream.firstTokenAt - stream.startedAt : null;
    const tps = elapsed > 0 && tokens > 0 ? tokens / (elapsed / 1000) : null;
    const turn = {
      modelId: ctx.model?.id ?? "unknown",
      provider: ctx.model?.provider ?? "unknown",
      startTime: stream.startedAt,
      ttft,
      duration: elapsed,
      estTokens: stream.estimatedTokens,
      estThinking: stream.estimatedThinking,
      actualTokens,
      actualThinking,
      tps
    };
    sessionMetrics.turnCount++;
    sessionMetrics.totalTokens += tokens;
    sessionMetrics.totalThinkingTokens += thinkTokens;
    sessionMetrics.totalDurationMs += elapsed;
    sessionMetrics.totalCost += cost;
    sessionMetrics.turns.push(turn);
    const tpsStr = tps !== null ? ` · ${tps.toFixed(0)} tps` : "";
    const ttftStr = ttft !== null ? `${fmt(ttft)} ttft` : "— ttft";
    const tokStr = actualTokens !== null ? fmtTokens(actualTokens) : `${fmtTokens(stream.estimatedTokens)} est`;
    ctx.ui.setStatus("perf", `${ttftStr}${tpsStr} · ${tokStr} · ${fmt(elapsed)}  (${sessionMetrics.turnCount})`);
    stream = null;
  });
  pi.on("session_shutdown", async (_event, ctx) => {
    ctx.ui.setStatus("perf", undefined);
  });
  pi.registerCommand("perf", {
    description: "Show performance dashboard with TTFT, TPS, and cumulative metrics. Usage: /perf [reset]",
    handler: async (args, ctx) => {
      const input = (args || "").trim().toLowerCase();
      if (input === "reset") {
        sessionMetrics = {
          startupMs: sessionMetrics.startupMs,
          turnCount: 0,
          totalTokens: 0,
          totalThinkingTokens: 0,
          totalDurationMs: 0,
          totalCost: 0,
          turns: []
        };
        ctx.ui.setStatus("perf", "reset");
        ctx.ui.notify("Performance counters reset.", "info");
        return;
      }
      if (input === "raw") {
        const dump = {
          ...sessionMetrics,
          turns: sessionMetrics.turns.map((t) => ({
            ...t,
            isoStart: new Date(t.startTime).toISOString()
          }))
        };
        ctx.ui.setEditorText(JSON.stringify(dump, null, 2));
        return;
      }
      if (ctx.hasUI) {
        await ctx.ui.custom((tui, theme, _kb, done) => {
          const lines = renderDashboard(sessionMetrics, theme);
          return {
            render: (_w) => lines,
            invalidate: () => {},
            handleInput: (data) => {
              if (data === "\x1B" || data === "q" || data === "\r")
                done(undefined);
            }
          };
        }, { overlay: true });
      } else {
        const lines = renderDashboard(sessionMetrics, {
          fg: (_c, s) => s,
          bold: (s) => s
        });
        ctx.ui.setEditorText(lines.join(`
`));
      }
    }
  });
}
export {
  piperf_default as default
};
