import { homedir } from "node:os";
import { relative } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const LOGO = [
  "██████╗  ██╗",
  "██╔══██╗ ██║",
  "██████╔╝ ██║",
  "██╔═══╝  ██║",
  "██║      ██║",
  "╚═╝      ╚═╝",
];

function formatDirectory(cwd: string) {
  const home = homedir();
  if (cwd === home) return "~";
  if (cwd.startsWith(`${home}/`)) return `~/${relative(home, cwd)}`;
  return cwd;
}

function center(text: string, width: number) {
  const padding = Math.max(0, Math.floor((width - visibleWidth(text)) / 2));
  return truncateToWidth(`${" ".repeat(padding)}${text}`, width, "");
}

export default function flowTitle(pi: ExtensionAPI) {
  let requestRender: (() => void) | undefined;
  let cwd = "";
  let model = "";

  function install(ctx: ExtensionContext) {
    if (ctx.mode !== "tui") return;

    ctx.ui.setHeader((tui, theme) => {
      requestRender = () => tui.requestRender();

      return {
        render(width: number) {
          const logo = LOGO.map((line) =>
            center(theme.fg("accent", line), width),
          );
          const modelLabel = model || "no model";
          const subtitle = `${theme.fg("muted", modelLabel)} ${theme.fg("dim", "·")} ${theme.fg("muted", formatDirectory(cwd))}`;
          return ["", ...logo, center(subtitle, width), ""];
        },
        invalidate() {},
      };
    });

    ctx.ui.setTitle(`pi · ${formatDirectory(cwd)}`);
  }

  pi.on("session_start", (_event, ctx) => {
    cwd = ctx.cwd;
    model = ctx.model?.id ?? "";
    install(ctx);
  });

  pi.on("model_select", (event) => {
    model = event.model.id;
    requestRender?.();
  });

  pi.registerCommand("flow-title", {
    description: "Show the custom PI startup header",
    handler: async (_args, ctx) => {
      cwd = ctx.cwd;
      model = ctx.model?.id ?? model;
      install(ctx);
      requestRender?.();
    },
  });

  pi.registerCommand("flow-title-builtin", {
    description: "Restore Pi's built-in startup header",
    handler: async (_args, ctx) => {
      ctx.ui.setHeader(undefined);
      ctx.ui.notify("Built-in header restored", "info");
    },
  });

  pi.on("session_shutdown", (_event, ctx) => {
    requestRender = undefined;
    if (ctx.mode === "tui") ctx.ui.setHeader(undefined);
  });
}
