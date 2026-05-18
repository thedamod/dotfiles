// dotfiles/.pi/agent/extensions/openai-codex-fast-mode.ts
var SERVICE_TIER = "priority";
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isOpenAICodexResponsesPayload(payload) {
  if (!isRecord(payload))
    return false;
  const model = payload.model;
  if (typeof model === "string" && model.includes("codex"))
    return true;
  return payload.stream === true && typeof payload.instructions === "string" && Array.isArray(payload.input) && payload.tool_choice === "auto" && "prompt_cache_key" in payload;
}
function openai_codex_fast_mode_default(pi) {
  pi.on("before_provider_request", (event) => {
    if (!isOpenAICodexResponsesPayload(event.payload))
      return;
    return {
      ...event.payload,
      service_tier: SERVICE_TIER
    };
  });
}
export {
  openai_codex_fast_mode_default as default
};
