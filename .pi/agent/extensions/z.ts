import { homedir } from "node:os";
import { realpath, stat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  SessionManager,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";

async function existingDirectory(input: string, cwd: string): Promise<string | undefined> {
  const expanded = input === "~"
    ? homedir()
    : input.startsWith("~/")
      ? resolve(homedir(), input.slice(2))
      : resolve(cwd, input);

  try {
    if (!(await stat(expanded)).isDirectory()) return undefined;
    return await realpath(expanded);
  } catch {
    return undefined;
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("z", {
    description: "Change pi's working directory using zoxide",
    handler: async (rawArgs, ctx) => {
      let query = rawArgs.trim();
      if (!query && ctx.hasUI) {
        query = (await ctx.ui.input("Jump with zoxide", "directory or search terms"))?.trim() ?? "";
      }
      if (!query) {
        ctx.ui.notify("Usage: /z <directory or zoxide search terms>", "warning");
        return;
      }

      let target = await existingDirectory(query, ctx.cwd);
      if (!target) {
        const terms = query.split(/\s+/).filter(Boolean);
        const result = await pi.exec("zoxide", ["query", "--", ...terms]);
        if (result.code !== 0 || !result.stdout.trim()) {
          const detail = result.stderr.trim() || `No zoxide match for: ${query}`;
          ctx.ui.notify(detail, "error");
          return;
        }
        target = await existingDirectory(result.stdout.trim().split("\n")[0]!, ctx.cwd);
      }

      if (!target) {
        ctx.ui.notify(`zoxide returned a directory that does not exist for: ${query}`, "error");
        return;
      }
      if (target === ctx.cwd) {
        ctx.ui.notify(`Already in ${target}`, "info");
        return;
      }

      const sourceSession = ctx.sessionManager.getSessionFile();
      const destination = sourceSession
        ? SessionManager.forkFrom(sourceSession, target)
        : SessionManager.create(target);

      if (!sourceSession) {
        destination.appendCustomEntry("z-cwd", { from: ctx.cwd, to: target });
      }

      const destinationFile = destination.getSessionFile();
      if (!destinationFile) {
        ctx.ui.notify("Could not create a session in the target directory", "error");
        return;
      }

      const result = await ctx.switchSession(destinationFile, {
        withSession: async (newCtx) => {
          process.chdir(target!);
          newCtx.ui.notify(`Working directory: ${target}`, "info");
        },
      });

      if (result.cancelled) {
        ctx.ui.notify("Directory change cancelled", "warning");
      }
    },
  });
}
