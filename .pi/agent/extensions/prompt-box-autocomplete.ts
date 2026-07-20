/**
 * Prompt Box Autocomplete Modifier
 *
 * Changes:
 * 1. Autocomplete list appears ABOVE the editor instead of below
 * 2. `/` only shows commands (no skills)
 * 3. `$` shows skills autocomplete
 * 4. Selecting `$skill` inserts colored `$skillname` token (not full content)
 * 5. Backspace on a `$skillname` token deletes the entire token at once
 * 6. Sending the message expands `$skillname` to full skill content for the agent
 *
 * Usage: Place in ~/.pi/agent/extensions/ and run `/reload` in pi.
 *        Or start pi with: pi -e ~/.pi/agent/extensions/prompt-box-autocomplete.ts
 */
import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { type AutocompleteItem, type AutocompleteProvider, type AutocompleteSuggestions, fuzzyFilter } from "@earendil-works/pi-tui";
import { readFileSync, existsSync } from "node:fs";

// ── Skill cache ──────────────────────────────────────────────────────────────

interface SkillEntry {
	name: string;
	description: string;
	filePath: string;
	content: string;
}

let cachedSkills: SkillEntry[] | null = null;

function getSkillCommands(pi: ExtensionAPI): SkillEntry[] {
	if (cachedSkills) return cachedSkills;

	const commands = pi.getCommands();
	const skills: SkillEntry[] = [];

	for (const cmd of commands) {
		if (cmd.source !== "skill") continue;
		const name = cmd.name.replace(/^skill:/, "");
		const filePath = cmd.sourceInfo.path;
		if (!filePath || !existsSync(filePath)) {
			skills.push({ name, description: cmd.description ?? "", filePath: filePath ?? "", content: "" });
			continue;
		}
		try {
			const content = readFileSync(filePath, "utf-8");
			skills.push({ name, description: cmd.description ?? "", filePath, content });
		} catch {
			skills.push({ name, description: cmd.description ?? "", filePath, content: "" });
		}
	}

	cachedSkills = skills;
	return skills;
}

function invalidateSkillCache(): void {
	cachedSkills = null;
}

// ── Autocomplete provider wrapper ────────────────────────────────────────────

function extractDollarToken(textBeforeCursor: string): { prefix: string; query: string } | null {
	const match = textBeforeCursor.match(/(?:^|\s)(\$([\w-]*))$/);
	if (!match) return null;
	return { prefix: match[1]!, query: match[2]! };
}

function extractSlashToken(textBeforeCursor: string): string | null {
	const match = textBeforeCursor.match(/(\/[\w:-]*)$/);
	if (!match) return null;
	return match[1]!;
}

function createSmartAutocompleteProvider(
	current: AutocompleteProvider,
	getSkills: () => SkillEntry[],
): AutocompleteProvider {
	return {
		triggerCharacters: ["$"],

		async getSuggestions(
			lines: string[],
			cursorLine: number,
			cursorCol: number,
			options: { signal: AbortSignal; force?: boolean },
		): Promise<AutocompleteSuggestions | null> {
			const line = lines[cursorLine] ?? "";
			const before = line.slice(0, cursorCol);

			// ── $ trigger: show skills ──
			const dollar = extractDollarToken(before);
			if (dollar) {
				const skills = getSkills();
				const query = dollar.query.toLowerCase();

				let matched: AutocompleteItem[];
				if (!query) {
					matched = skills.map((s) => ({
						value: s.name,
						label: s.name,
						description: s.description,
					}));
				} else {
					const filtered = fuzzyFilter(skills, query, (s) => `${s.name} ${s.description}`);
					matched = filtered.map((f) => ({
						value: f.name,
						label: f.name,
						description: f.description,
					}));
				}

				if (matched.length === 0) return null;
				return { items: matched.slice(0, 20), prefix: dollar.prefix };
			}

			// ── / trigger: delegate but filter out skills ──
			const slashToken = extractSlashToken(before);
			if (slashToken) {
				const result = await current.getSuggestions(lines, cursorLine, cursorCol, options);
				if (!result) return null;
				const filtered = result.items.filter((item) => !item.value.startsWith("/skill:"));
				if (filtered.length === 0) return null;
				return { items: filtered, prefix: result.prefix };
			}

			// ── Everything else: delegate ──
			return current.getSuggestions(lines, cursorLine, cursorCol, options);
		},

		applyCompletion(
			lines: string[],
			cursorLine: number,
			cursorCol: number,
			item: AutocompleteItem,
			prefix: string,
		): { lines: string[]; cursorLine: number; cursorCol: number } {
			// $ skill: insert `$name` token (not full content)
			if (prefix.startsWith("$")) {
				const token = `$${item.value}`;
				const line = lines[cursorLine]!;
				const beforeCursor = line.slice(0, cursorCol - prefix.length);
				const afterCursor = line.slice(cursorCol);
				lines[cursorLine] = beforeCursor + token + afterCursor;
				return {
					lines,
					cursorLine,
					cursorCol: beforeCursor.length + token.length,
				};
			}

			return current.applyCompletion(lines, cursorLine, cursorCol, item, prefix);
		},

		shouldTriggerFileCompletion(
			lines: string[],
			cursorLine: number,
			cursorCol: number,
		): boolean {
			const line = lines[cursorLine] ?? "";
			const before = line.slice(0, cursorCol);
			if (extractDollarToken(before) || extractSlashToken(before)) return false;
			return current.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
		},
	};
}

// ── Input event: expand $name to full skill content before sending ─────────

function expandDollarReferences(text: string, skills: SkillEntry[]): string {
	return text.replace(/\$(\w[\w-]*)\b/g, (_match, name) => {
		const skill = skills.find((s) => s.name === name);
		if (skill?.content) {
			// Strip frontmatter and keep the skill body
			const body = skill.content.replace(/^---[\s\S]*?---\n?/, "").trim();
			return body;
		}
		return _match;
	});
}

// Also catch any /skill:name that was manually typed
function expandSlashSkillReference(text: string, skills: SkillEntry[]): string {
	return text.replace(/^\/skill:(\w[\w-]*)/gm, (_match, name) => {
		const skill = skills.find((s) => s.name === name);
		if (skill?.content) {
			return skill.content.replace(/^---[\s\S]*?---\n?/, "").trim();
		}
		return _match;
	});
}

// ── Extension entry point ────────────────────────────────────────────────────

export default function (pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		invalidateSkillCache();

		// The active editor is supplied by rounded-editor.ts, which also places
		// autocomplete above the box and renders/deletes $skill tokens atomically.
		// Keeping editor ownership in one extension avoids last-writer-wins races.

		// Autocomplete: $ for skills, / for commands only
		ctx.ui.addAutocompleteProvider((current) =>
			createSmartAutocompleteProvider(current, () => getSkillCommands(pi)),
		);

	});

	// 3. Expand $name and /skill:name on send
	pi.on("input", async (event, ctx) => {
		if (event.source === "extension") return { action: "continue" };

		const skills = getSkillCommands(pi);
		let expanded = event.text;
		expanded = expandDollarReferences(expanded, skills);
		expanded = expandSlashSkillReference(expanded, skills);

		if (expanded !== event.text) {
			return { action: "transform", text: expanded };
		}
		return { action: "continue" };
	});
}
