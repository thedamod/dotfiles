import { readdirSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "../config.js";
import { AuthStorage } from "./auth-storage.js";
import { ModelRegistry } from "./model-registry.js";
import { DefaultResourceLoader } from "./resource-loader.js";
import { createAgentSession } from "./sdk.js";
import { SettingsManager } from "./settings-manager.js";
function applyExtensionFlagValues(resourceLoader, extensionFlagValues) {
    if (!extensionFlagValues) {
        return [];
    }
    const diagnostics = [];
    const extensionsResult = resourceLoader.getExtensions();
    const registeredFlags = new Map();
    for (const extension of extensionsResult.extensions) {
        for (const [name, flag] of extension.flags) {
            registeredFlags.set(name, { type: flag.type });
        }
    }
    const unknownFlags = [];
    for (const [name, value] of extensionFlagValues) {
        const flag = registeredFlags.get(name);
        if (!flag) {
            unknownFlags.push(name);
            continue;
        }
        if (flag.type === "boolean") {
            extensionsResult.runtime.flagValues.set(name, true);
            continue;
        }
        if (typeof value === "string") {
            extensionsResult.runtime.flagValues.set(name, value);
            continue;
        }
        diagnostics.push({
            type: "error",
            message: `Extension flag "--${name}" requires a value`,
        });
    }
    if (unknownFlags.length > 0) {
        diagnostics.push({
            type: "error",
            message: `Unknown option${unknownFlags.length === 1 ? "" : "s"}: ${unknownFlags.map((name) => `--${name}`).join(", ")}`,
        });
    }
    return diagnostics;
}
/**
 * Create cwd-bound runtime services.
 *
 * Returns services plus diagnostics. It does not create an AgentSession.
 */
export async function createAgentSessionServices(options) {
    const cwd = options.cwd;
    const agentDir = options.agentDir ?? getAgentDir();
    const authStorage = options.authStorage ?? AuthStorage.create(join(agentDir, "auth.json"));
    const settingsManager = options.settingsManager ?? SettingsManager.create(cwd, agentDir);
    const modelRegistry = options.modelRegistry ?? ModelRegistry.create(authStorage, join(agentDir, "models.json"));
    const resourceLoader = new DefaultResourceLoader({
        ...(options.resourceLoaderOptions ?? {}),
        cwd,
        agentDir,
        settingsManager,
    });
    const argv = process.argv.slice(2);
    const isInteractive = !argv.includes("-p") && !argv.includes("--print") && !argv.includes("--mode");
    const lazyResources = isInteractive && process.env.PI_LAZY_RESOURCES !== "0";
    if (lazyResources) {
        process.env.PI_RESOURCES_DEFERRED = "1";
        // Load only tiny UI-critical startup extensions before first paint.
        // Everything else (heavy extensions, skills, prompts, package resources) is loaded after the TUI is visible.
        const original = {
            noExtensions: resourceLoader.noExtensions,
            noSkills: resourceLoader.noSkills,
            noPromptTemplates: resourceLoader.noPromptTemplates,
            noThemes: resourceLoader.noThemes,
            additionalExtensionPaths: resourceLoader.additionalExtensionPaths,
            additionalThemePaths: resourceLoader.additionalThemePaths,
        };
        const defaultEagerExtensions = (() => {
            try {
                const dir = join(agentDir, "extensions");
                return readdirSync(dir)
                    .filter((name) => /\.(js|mjs|cjs|ts)$/.test(name))
                    .map((name) => join(dir, name));
            }
            catch {
                return [];
            }
        })();
        const eagerExtensions = (process.env.PI_EAGER_EXTENSIONS
            ? process.env.PI_EAGER_EXTENSIONS.split(",").map((p) => p.trim()).filter(Boolean)
            : defaultEagerExtensions);
        resourceLoader.noExtensions = true;
        resourceLoader.noSkills = true;
        resourceLoader.noPromptTemplates = true;
        resourceLoader.noThemes = true;
        resourceLoader.additionalExtensionPaths = eagerExtensions;
        const activeTheme = settingsManager.getTheme?.();
        resourceLoader.additionalThemePaths = activeTheme ? [join(agentDir, "themes", `${activeTheme}.json`)] : [];
        await resourceLoader.reload();
        resourceLoader.noExtensions = original.noExtensions;
        resourceLoader.noSkills = original.noSkills;
        resourceLoader.noPromptTemplates = original.noPromptTemplates;
        resourceLoader.noThemes = original.noThemes;
        resourceLoader.additionalExtensionPaths = original.additionalExtensionPaths;
        resourceLoader.additionalThemePaths = original.additionalThemePaths;
    }
    else {
        await resourceLoader.reload();
    }
    const diagnostics = [];
    const extensionsResult = resourceLoader.getExtensions();
    for (const { name, config, extensionPath } of extensionsResult.runtime.pendingProviderRegistrations) {
        try {
            modelRegistry.registerProvider(name, config);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            diagnostics.push({
                type: "error",
                message: `Extension "${extensionPath}" error: ${message}`,
            });
        }
    }
    extensionsResult.runtime.pendingProviderRegistrations = [];
    if (!lazyResources) {
        diagnostics.push(...applyExtensionFlagValues(resourceLoader, options.extensionFlagValues));
    }
    return {
        cwd,
        agentDir,
        authStorage,
        settingsManager,
        modelRegistry,
        resourceLoader,
        diagnostics,
    };
}
/**
 * Create an AgentSession from previously created services.
 *
 * This keeps session creation separate from service creation so callers can
 * resolve model, thinking, tools, and other session inputs against the target
 * cwd before constructing the session.
 */
export async function createAgentSessionFromServices(options) {
    return createAgentSession({
        cwd: options.services.cwd,
        agentDir: options.services.agentDir,
        authStorage: options.services.authStorage,
        settingsManager: options.services.settingsManager,
        modelRegistry: options.services.modelRegistry,
        resourceLoader: options.services.resourceLoader,
        sessionManager: options.sessionManager,
        model: options.model,
        thinkingLevel: options.thinkingLevel,
        scopedModels: options.scopedModels,
        tools: options.tools,
        noTools: options.noTools,
        customTools: options.customTools,
        sessionStartEvent: options.sessionStartEvent,
    });
}
//# sourceMappingURL=agent-session-services.js.map