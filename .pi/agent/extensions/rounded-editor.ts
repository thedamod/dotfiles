import { spawnSync } from "child_process";
import { randomUUID } from "crypto";
import { existsSync, readFileSync } from "fs";
import { type ExtensionAPI, CustomEditor } from "@earendil-works/pi-coding-agent";
import {
  visibleWidth,
  truncateToWidth,
  type TUI,
  type EditorTheme,
} from "@earendil-works/pi-tui";

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
/*  WSL2 clipboard helper                                             */
/* ------------------------------------------------------------------ */

function isWSL(): boolean {
  if (process.env.WSL_DISTRO_NAME || process.env.WSLENV) return true;
  try {
    const release = readFileSync("/proc/version", "utf-8");
    return /microsoft|wsl/i.test(release);
  } catch { return false; }
}

/**
 * Read clipboard image on WSL2 via PowerShell.
 * Avoids `wslpath` because /tmp/ on Linux ≠ Windows TEMP.
 * Instead we get the Windows temp dir from PowerShell itself,
 * then translate the path ourselves.
 */
function pasteImageFromClipboard(insert: (path: string) => void) {
  try {
    /* 1. Get Windows temp directory from within PowerShell */
    const psGetTmp = spawnSync("powershell.exe", ["-NoProfile", "-Command", "Write-Output $env:TEMP"], {
      timeout: 10000,
    });
    if (psGetTmp.status !== 0 || !psGetTmp.stdout.toString().trim()) return;
    const winTemp = psGetTmp.stdout.toString("utf-8").trim(); // e.g. C:\Users\laksm\AppData\Local\Temp

    /* 2. Convert Windows C:\... → /mnt/c/... */
    const mnt = winTemp.replace(/\\/g, "/").replace(/^([A-Za-z]):\//i, "/mnt/$1/");
    if (!mnt.startsWith("/mnt/")) return;

    const fileName = `pi-wsl-clip-${randomUUID()}.png`;
    const winPath = `${winTemp}\\${fileName}`.replace(/'/g, "''");
    const linuxPath = `${mnt}/${fileName}`;

    /* 3. Run PowerShell to get clipboard image and save to Windows temp */
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "Add-Type -AssemblyName System.Drawing",
      `$path = '${winPath}'`,
      "$img = [System.Windows.Forms.Clipboard]::GetImage()",
      "if ($img) { $img.Save($path, [System.Drawing.Imaging.ImageFormat]::Png); Write-Output 'ok' } else { Write-Output 'empty' }",
    ].join("; ");

    const r = spawnSync("powershell.exe", ["-NoProfile", "-Command", script], {
      timeout: 20000,
    });
    if (r.status !== 0) return;
    const output = r.stdout.toString("utf-8").trim();
    if (output !== "ok") return;

    /* 4. Read back from the /mnt/c/... path */
    if (!existsSync(linuxPath)) return;
    insert(linuxPath);
  } catch { /* ignore */ }
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

    // Restore built-in header (no custom header — avoids scroll issues)
    ctx.ui.setHeader(undefined);

    /* -- editor: rounded borders with model / dir info -------------- */

    ctx.ui.setEditorComponent((_tui: TUI, edTheme: EditorTheme, kb: any) => {
      if (!tui) tui = _tui;

      class RoundedEditor extends (CustomEditor as any) {
        constructor() {
          super(_tui, edTheme, kb, { paddingX: 1 });
          this.borderColor = muted;

          // WSL2: override paste handler to use PowerShell (avoids xclip DISPLAY errors)
          if (process.platform === "linux" && isWSL()) {
            this.onPasteImage = () => {
              pasteImageFromClipboard((filePath: string) => {
                this.insertTextAtCursor?.(filePath);
                _tui.requestRender();
              });
            };
          }
        }

        render(width: number): string[] {
          const result = super.render(width);
          if (result.length < 2 || width < 4) return result;

          // autocomplete separator line → blank
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

          result[top] = muted(
            "\u256D" +
            "\u2500".repeat(fL) +
            labStr +
            "\u2500".repeat(fR) +
            trStr +
            "\u2500".repeat(Math.max(0, width - 2 - fL - labW - fR - trW)) +
            "\u256E"
          );

          /* -- bottom border: padded dir left, padded usage right -- */

          const ds = fmtCwd(ctx.cwd);
          const bs = branch ? "\u2387 " + branch : "";
          // add leading/trailing spaces so content doesn't sit right against the arcs
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
          } catch {}
          const rightRaw = brParts.join(" ");
          const rightStr = rightRaw ? " " + rightRaw + " " : "";

          const leftW = visibleWidth(leftStr);
          const rightW = visibleWidth(rightStr);
          const gap = Math.max(0, width - 2 - leftW - rightW);

          result[bot] = muted(
            "\u2570" + leftStr + "\u2500".repeat(gap) + rightStr + "\u256F"
          );

          /* -- side borders -- */

          for (let i = top + 1; i < bot; i++) {
            const inner = truncateToWidth(result[i], Math.max(0, width - 2), "");
            const pad = " ".repeat(Math.max(0, width - 2 - visibleWidth(inner)));
            result[i] = muted("\u2502") + inner + pad + muted("\u2502");
          }

          return result;
        }
      }

      return new RoundedEditor();
    });
  });

  /* -- agent working spinner ---------------------------------------- */

  pi.on("agent_start", () => { working = true; stopSpin(); startSpin(); tui?.requestRender(); });
  pi.on("agent_end", () => { working = false; stopSpin(); tui?.requestRender(); });

  /* -- TPS / TTFT --------------------------------------------------- */

  pi.on("turn_start", async () => {
    tStart = Date.now();
    firstTok = null;
    // keep last tps/ttft visible until new data arrives
  });

  pi.on("message_update", async (ev) => {
    if (ev.message.role !== "assistant") return;
    const now = Date.now();
    let text = "";
    const c = ev.message.content;
    if (typeof c === "string") text = c;
    else if (Array.isArray(c))
      text = c.map((p: any) => (typeof p === "string" ? p : p?.text ?? "")).join("");
    if (firstTok === null && text.length > 0) {
      firstTok = now;
      lastTtft = now - tStart;
    }
    const secs = (now - tStart) / 1000;
    if (secs > 1 && text.length > 4) {
      tps = Math.round((text.length / 4) / secs);
    }
    tui?.requestRender();
  });

  pi.on("turn_end", async () => { tui?.requestRender(); });

  /* -- model / thinking changes ------------------------------------- */

  pi.on("model_select", async (ev) => { modelId = ev.model.id; provider = ev.model.provider; tui?.requestRender(); });
  pi.on("thinking_level_select", async (ev) => { thinkLvl = ev.level; tui?.requestRender(); });

  /* -- cleanup ------------------------------------------------------ */

  pi.on("session_shutdown", () => { stopSpin(); tui = void 0; });
}
