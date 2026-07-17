import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { spawn } from "node:child_process";

const BRIDGE = "/home/apollo/research/arcaine/scripts/pi_crypto_tool.py";

type ToolName = "python" | "search";

function invokeBridge(
  name: ToolName,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("python3", [BRIDGE], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { PATH: process.env.PATH ?? "", PYTHONIOENCODING: "utf-8" },
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve(Buffer.concat(stdout).toString("utf8").trim());
    };
    const abort = () => {
      child.kill("SIGKILL");
      finish(new Error("Arcaine tool call cancelled"));
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error("Arcaine tool bridge timed out"));
    }, 35_000);

    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        finish(new Error(Buffer.concat(stderr).toString("utf8").trim() || `Tool bridge exited ${code}`));
      } else {
        finish();
      }
    });
    child.stdin.end(JSON.stringify({ name, arguments: args }));
  });
}

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", (event, ctx) => {
    if (ctx.model?.provider !== "arcaine") return;
    return {
      systemPrompt:
        event.systemPrompt +
        "\n\nArcaine runtime contract:\n" +
        "- Start blind artifact analysis with `from crypto_agent.solver import analyze_artifact` and call `analyze_artifact(artifact, key_material=..., max_candidates=8)`.\n" +
        "- Verify a selected candidate with `from crypto_agent.solver import verify_candidate` and call `verify_candidate(artifact, plaintext, family, key)` in exactly that argument order.\n" +
        "- Do not import Crypto, cryptography, or guess unavailable module names.\n" +
        "- Stop and report only after the verification result contains `verified: true`.\n",
    };
  });

  pi.registerTool({
    name: "python",
    label: "Python",
    description:
      "Run bounded Python for cryptanalysis, candidate search, decoding, statistics, and exact round-trip verification. Print compact JSON or text.",
    promptSnippet: "Run bounded Python cryptanalysis and exact verification",
    promptGuidelines: [
      "Use python for artifact inspection, bounded key search, decoding, and exact round-trip verification.",
    ],
    parameters: Type.Object({
      code: Type.String({ description: "Complete Python source code to execute" }),
      timeout_seconds: Type.Optional(
        Type.Integer({ minimum: 1, maximum: 30, default: 10 }),
      ),
    }),
    async execute(_id, params, signal) {
      const text = await invokeBridge("python", params, signal);
      return { content: [{ type: "text", text }], details: { tool: "python" } };
    },
  });

  pi.registerTool({
    name: "search",
    label: "Crypto Search",
    description:
      "Search cryptography references from observed properties for signatures, attack methods, formats, and implementation guidance.",
    promptSnippet: "Search cryptography references from observed artifact properties",
    promptGuidelines: [
      "Use search for unfamiliar transformation signatures or attack references without assuming the cipher family.",
    ],
    parameters: Type.Object({
      query: Type.String(),
      top_k: Type.Optional(Type.Integer({ minimum: 1, maximum: 10, default: 5 })),
    }),
    async execute(_id, params, signal) {
      const text = await invokeBridge("search", params, signal);
      return { content: [{ type: "text", text }], details: { tool: "search" } };
    },
  });
}
