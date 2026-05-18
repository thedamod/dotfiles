// dotfiles/.pi/agent/extensions-src/flow-title.ts
import path from "node:path";
var RESET = "\x1B[0m";
var BOLD = "\x1B[1m";
var DEEP_BLUE = [48, 55, 75];
var BLUE = [70, 90, 140];
var SKY = [110, 162, 255];
var ICE = [140, 170, 210];
var PALETTE = [DEEP_BLUE, BLUE, SKY, ICE, SKY, BLUE];
function mix(a, b, t) {
  return Math.round(a + (b - a) * t);
}
function sampleGradient(position) {
  const wrapped = (position % 1 + 1) % 1;
  const scaled = wrapped * PALETTE.length;
  const index = Math.floor(scaled);
  const nextIndex = (index + 1) % PALETTE.length;
  const t = scaled - index;
  const a = PALETTE[index];
  const b = PALETTE[nextIndex];
  return [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
}
function fg([r, g, b], text) {
  return `\x1B[38;2;${r};${g};${b}m${text}${RESET}`;
}
function gradientText(text, phase) {
  const chars = [...text];
  const span = Math.max(chars.length - 1, 1);
  return chars.map((char, index) => {
    if (char === " ")
      return char;
    return fg(sampleGradient(index / span + phase), char);
  }).join("");
}
function center(text, width) {
  const length = [...text].length;
  if (length >= width)
    return text;
  return `${" ".repeat(Math.floor((width - length) / 2))}${text}`;
}
function projectName() {
  return path.basename(process.cwd()) || "session";
}
function renderHeader(width, phase, subtitleText) {
  const title = `${BOLD}${gradientText("pi", phase)}${RESET}`;
  const sep = fg([95, 87, 78], "  ·  ");
  const subtitle = fg([139, 129, 114], subtitleText);
  return ["", center(`${title}${sep}${subtitle}`, width), ""];
}
function flow_title_default(pi) {
  let requestRender;
  let currentModelId = "no model selected";
  function installHeader(ctx) {
    ctx.ui.setHeader((tui) => {
      requestRender = () => tui.requestRender();
      return {
        render(width) {
          return renderHeader(width, 0, `${currentModelId} · ${projectName()}`);
        },
        invalidate() {
          tui.requestRender();
        }
      };
    });
  }
  pi.on("session_start", (_event, ctx) => {
    currentModelId = ctx.model?.id ?? "no model selected";
    if (!ctx.hasUI)
      return;
    installHeader(ctx);
  });
  pi.on("model_select", (event) => {
    currentModelId = event.model.id;
    requestRender?.();
  });
  pi.on("session_shutdown", (_event, ctx) => {
    if (ctx.hasUI)
      ctx.ui.setHeader(undefined);
  });
  pi.registerCommand("flow-title", {
    description: "Enable the blue flowing gradient session header",
    handler: async (_args, ctx) => {
      installHeader(ctx);
      ctx.ui.notify("Flow title enabled", "info");
    }
  });
  pi.registerCommand("flow-title-builtin", {
    description: "Restore pi's built-in header for this session",
    handler: async (_args, ctx) => {
      ctx.ui.setHeader(undefined);
      ctx.ui.notify("Built-in header restored", "info");
    }
  });
}
export {
  flow_title_default as default
};
