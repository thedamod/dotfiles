import { spawnSync } from "child_process";
import { randomUUID } from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { type ExtensionAPI, CustomEditor } from "@earendil-works/pi-coding-agent";
import { matchesKey, visibleWidth, truncateToWidth, type TUI, type EditorTheme } from "@earendil-works/pi-tui";

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function fmtCwd(cwd: string): string {
  const home = process.env.HOME;
  if (home && cwd.startsWith(home)) return "~" + cwd.slice(home.length);
  return cwd;
}

function fmtContext(ctx: { getContextUsage(): any; model?: any }): string {
  const usage = ctx.getContextUsage();
  const cw = usage?.contextWindow ?? ctx.model?.contextWindow;
  if (!cw || !usage || usage.percent === null) return "ctx ?";
  return "ctx " + Math.round(usage.percent) + "%/" + (cw / 1000).toFixed(0) + "k";
}

function fmtThink(level: string): string {
  return level === "off" ? "off" : level;
}

const SPIN = ["\u280B", "\u2819", "\u2839", "\u2838", "\u283C", "\u2834", "\u2826", "\u2827", "\u2807", "\u280F"];

/* ------------------------------------------------------------------ */
/*  WSL2 clipboard helpers (merged from pi-wsl-images)               */
/* ------------------------------------------------------------------ */

function isWSL(): boolean {
  if (process.env.WSL_DISTRO_NAME || process.env.WSLENV) return true;
  try {
    const release = readFileSync("/proc/version", "utf-8");
    return /microsoft|wsl/i.test(release);
  } catch { return false; }
}

function readWindowsClipboardImagePng(): Buffer | null {
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "Add-Type -AssemblyName System.Drawing",
    "$img = [System.Windows.Forms.Clipboard]::GetImage()",
    "if (-not $img) { exit 2 }",
    "$ms = New-Object System.IO.MemoryStream",
    "$img.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)",
    "[Convert]::ToBase64String($ms.ToArray())",
  ].join("; ");

  try {
    const result = spawnSync(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-STA", "-Command", script],
      { encoding: "utf8", timeout: 10000, maxBuffer: 64 * 1024 * 1024 },
    );
    if (result.status !== 0) return null;
    const base64 = (result.stdout ?? "").trim();
    if (!base64) return null;
    return Buffer.from(base64, "base64");
  } catch {
    return null;
  }
}

function writeTempImage(bytes: Buffer): string {
  const filePath = join(tmpdir(), `pi-wsl-clipboard-${randomUUID()}.png`);
  writeFileSync(filePath, bytes);
  return filePath;
}

function replaceImagePlaceholders(text: string, placeholders: Map<string, string>): string {
  let next = text;
  for (const [placeholder, filePath] of placeholders) {
    next = next.split(placeholder).join(filePath);
  }
  return next;
}

/* ------------------------------------------------------------------ */
/*  Main extension                                                    */
/* ------------------------------------------------------------------ */

export default function (pi: ExtensionAPI) {
  let tui: TUI | undefined;
  let working = false;
  let spinIdx = 0;
  let spinTimer: ReturnType<typeof setInterval> | undefined;
  let branch: string | undefined;
  let modelId = "";
  let provider = "";
  let thinkLvl = "off";
  let tStart = 0;
  let firstTok: number | null = null;
  let lastTtft = 0;
  let tps = 0;

  // WSL image paste state
  const placeholders = new Map<string, string>();
  const nextImageNumber = { value: 1 };

  /* -- WSL paste command (from pi-wsl-images) -- */
  pi.registerCommand("wsl-paste-image", {
    description: "Paste an image from the Windows clipboard into the editor",
    handler: async (_args: any, ctx: any) => {
      if (!isWSL()) return;
      const bytes = readWindowsClipboardImagePng();
      if (!bytes || bytes.length === 0) {
        ctx.ui.notify("No image found in the Windows clipboard", "warning");
        return;
      }
      const filePath = writeTempImage(bytes);
      const placeholder = `[Image #${nextImageNumber.value++}]`;
      placeholders.set(placeholder, filePath);
      ctx.ui.pasteToEditor(placeholder);
      ctx.ui.notify(`Pasted ${placeholder}`, "info");
    },
  });

  /* -- WSL input placeholder transformation (from pi-wsl-images) -- */
  pi.on("input", async (event: any) => {
    const transformed = replaceImagePlaceholders(event.text, placeholders);
    const hadPlaceholders = placeholders.size > 0;
    if (hadPlaceholders) {
      placeholders.clear();
      nextImageNumber.value = 1;
    }
    if (transformed === event.text) return { action: "continue" };
    return { action: "transform", text: transformed };
  });

  function startSpin() {
    stopSpin();
    if (!tui) return;
    spinTimer = setInterval(() => {
      spinIdx = (spinIdx + 1) % SPIN.length;
      tui!.requestRender();
    }, 100);
  }

  function stopSpin() {
    if (spinTimer !== void 0) { clearInterval(spinTimer); spinTimer = void 0; }
  }

  pi.on("session_start", async (_event, ctx) => {
    if (!ctx.hasUI) return;

    modelId = ctx.model?.id ?? "";
    provider = ctx.model?.provider ?? "";
    thinkLvl = pi.getThinkingLevel();

    // muted border colour (captured from the app theme)
    const appTheme: any = (ctx.ui as any).theme;
    const muted = (s: string) => appTheme.fg("muted", s);

    // git branch
    const r = await pi.exec("git", ["branch", "--show-current"], { cwd: ctx.cwd })
      .catch(() => undefined);
    const out = r?.stdout.trim();
    branch = out && out.length > 0 ? out : undefined;

    // Restore built-in header (no custom header)
    ctx.ui.setHeader(undefined);

    /* -- editor: rounded borders + WSL paste support -- */
    ctx.ui.setEditorComponent((_tui: TUI, edTheme: EditorTheme, kb: any) => {
      if (!tui) tui = _tui;

      class RoundedEditor extends (CustomEditor as any) {
        constructor() {
          super(_tui, edTheme, kb, { paddingX: 1 });
          this._muted = muted;

          // WSL2: override paste handler to use PowerShell (avoids xclip DISPLAY errors)
          if (isWSL()) {
            this.onPasteImage = () => {
              const bytes = readWindowsClipboardImagePng();
              if (!bytes || bytes.length === 0) return;
              const filePath = writeTempImage(bytes);
              this.insertTextAtCursor?.(filePath);
              _tui.requestRender();
            };
          }
        }

        // Handle Alt+V for WSL image paste (merged from pi-wsl-images)
        handleInput(data: string): void {
          if (matchesKey(data, "alt+v")) {
            void (async () => {
              if (!isWSL()) { super.handleInput(data); return; }
              const bytes = readWindowsClipboardImagePng();
              if (!bytes || bytes.length === 0) {
                super.handleInput(data);
                return;
              }
              const filePath = writeTempImage(bytes);
              const placeholder = `[Image #${nextImageNumber.value++}]`;
              placeholders.set(placeholder, filePath);
              this.insertTextAtCursor?.(placeholder);
              _tui.requestRender();
            })();
            return;
          }

          super.handleInput(data);
        }

        render(width: number): string[] {
          try {
            const result = super.render(width);
            if (result.length < 2 || width < 4) return result;

            const _muted = this._muted || muted;

            // Detect and blank the autocomplete separator line
            const hasAc = (this as any).autocompleteState;
            const sep = hasAc && result.length > 3
              ? result.findIndex((l: string, i: number) => i > 0 && l.indexOf("\u2500") !== -1)
              : -1;
            if (sep > 0) result[sep] = " ".repeat(Math.max(0, width));

            const top = 0;
            const bot = result.length - 1;

            /* -- top border: label left, model / tps right -- */
            const rawLabel = (this as any).statusLabel;
            const labStr = (typeof rawLabel === "string" && rawLabel && width > 14)
              ? " " + rawLabel + " " : "";
            const labW = visibleWidth(labStr);

            const trParts: string[] = [];
            if (modelId) trParts.push(modelId);
            if (thinkLvl !== "off") trParts.push(fmtThink(thinkLvl));
            if (tps > 0) trParts.push("\u26A1" + tps.toFixed(0) + "tps");
            if (lastTtft > 0) trParts.push(String(lastTtft) + "ms");
            const trStr = trParts.length ? " " + trParts.join(" ") + " " : "";
            const trW = trStr ? visibleWidth(trStr) : 0;

            const fill = Math.max(0, width - 2 - labW - trW);
            const fL = Math.floor(fill / 2);
            const fR = fill - fL;

            result[top] = "\u256D" +
              "\u2500".repeat(fL) +
              labStr +
              "\u2500".repeat(fR) +
              trStr +
              "\u2500".repeat(Math.max(0, width - 2 - fL - labW - fR - trW)) +
              "\u256E";
            result[top] = _muted(result[top]);

            /* -- bottom border: padded dir left, padded usage right -- */
            const ds = fmtCwd(ctx.cwd);
            const bs = branch ? "\u2387 " + branch : "";
            const leftRaw = [ds, bs].filter(Boolean).join(" ");
            const leftStr = leftRaw ? " " + leftRaw + " " : "";

            const brParts: string[] = [fmtContext(ctx)];
            if (working) brParts.push(SPIN[spinIdx]);
            try {
              const fd = (_tui as any).footerDataProvider;
              if (fd?.getExtensionStatuses) {
                for (const [, v] of Array.from(fd.getExtensionStatuses().entries())) {
                  brParts.push(v);
                }
              }
            } catch { /* ignore */ }
            const rightRaw = brParts.join(" ");
            const rightStr = rightRaw ? " " + rightRaw + " " : "";

            const leftW = visibleWidth(leftStr);
            const rightW = visibleWidth(rightStr);
            const gap = Math.max(0, width - 2 - leftW - rightW);

            result[bot] = "\u2570" + leftStr + "\u2500".repeat(gap) + rightStr + "\u256F";
            result[bot] = _muted(result[bot]);

            /* -- side borders -- */
            for (let i = top + 1; i < bot; i++) {
              const inner = truncateToWidth(result[i], Math.max(0, width - 2), "");
              const pad = " ".repeat(Math.max(0, width - 2 - visibleWidth(inner)));
              result[i] = _muted("\u2502") + inner + pad + _muted("\u2502");
            }

            return result;
          } catch (e) {
            return super.render(width);
          }
        }
      }

      return new RoundedEditor();
    });
  });

  /* -- agent working spinner -- */
  pi.on("agent_start", () => { working = true; stopSpin(); startSpin(); tui?.requestRender(); });
  pi.on("agent_end", () => { working = false; stopSpin(); tui?.requestRender(); });

  /* -- TPS / TTFT -- */
  pi.on("turn_start", async () => { tStart = Date.now(); firstTok = null; });
  pi.on("message_update", async (ev) => {
    if (ev.message.role !== "assistant") return;
    const now = Date.now();
    let text = "";
    const c = ev.message.content;
    if (typeof c === "string") text = c;
    else if (Array.isArray(c))
      text = c.map((p: any) => (typeof p === "string" ? p : p?.text ?? "")).join("");
    if (firstTok === null && text.length > 0) { firstTok = now; lastTtft = now - tStart; }
    const secs = (now - tStart) / 1000;
    if (secs > 1 && text.length > 4) tps = Math.round((text.length / 4) / secs);
    tui?.requestRender();
  });
  pi.on("turn_end", async () => { tui?.requestRender(); });

  /* -- model / thinking changes -- */
  pi.on("model_select", async (ev) => { modelId = ev.model.id; provider = ev.model.provider; tui?.requestRender(); });
  pi.on("thinking_level_select", async (ev) => { thinkLvl = ev.level; tui?.requestRender(); });

  /* -- cleanup -- */
  pi.on("session_shutdown", () => { stopSpin(); tui = void 0; });
}
