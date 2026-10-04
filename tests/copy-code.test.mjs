import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const directory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(directory, "..");
const extensionsDirectory = join(projectRoot, "extensions");
const requireFromProject = createRequire(join(projectRoot, "package.json"));

function findPiRoot() {
	if (process.env.PI_PACKAGE_DIR) return resolve(process.env.PI_PACKAGE_DIR);
	try {
		return resolve(dirname(requireFromProject.resolve("@earendil-works/pi-coding-agent")), "..");
	} catch {
		return resolve(dirname(process.execPath), "../lib/node_modules/@earendil-works/pi-coding-agent");
	}
}

const piRoot = findPiRoot();
const requirePi = createRequire(join(piRoot, "package.json"));
const { createJiti } = requirePi("jiti");
const jiti = createJiti(import.meta.url, {
	moduleCache: false,
	fsCache: false,
	alias: {
		"@earendil-works/pi-coding-agent": join(piRoot, "dist/index.js"),
		"@earendil-works/pi-tui": requirePi.resolve("@earendil-works/pi-tui"),
	},
});
const { extractCodeBlocks, collectCodeBlocks, createCopyCodeHandler, default: extension } = await jiti.import(join(extensionsDirectory, "copy-code.ts"));

const fence = (text, language = "sh") => `\`\`\`${language}\n${text}\n\`\`\``;
let nextId = 0;
function entry(source, options = {}) {
	return {
		type: "message",
		id: `test-${++nextId}`,
		parentId: null,
		timestamp: "2026-10-02T08:00:00.000Z",
		message: {
			role: "assistant",
			stopReason: "stop",
			content: [{ type: "text", text: source }],
			...options,
		},
	};
}
function harness(entries, options = {}) {
	const copied = [];
	const notices = [];
	const dialogs = [];
	const ctx = {
		mode: options.mode ?? "tui",
		hasUI: options.hasUI ?? true,
		isIdle: () => options.idle ?? true,
		sessionManager: { getBranch: () => entries },
		ui: {
			notify: (message, level) => notices.push({ message, level }),
			select: async (title, labels) => {
				dialogs.push({ title, labels });
				return options.cancel ? undefined : labels[options.selectedIndex ?? 0];
			},
		},
	};
	const handler = createCopyCodeHandler(async (text) => {
		if (options.copyError) throw new Error(options.copyError);
		copied.push(text);
	});
	return { copied, notices, dialogs, run: (args = "") => handler(args, ctx) };
}

test("preserves tabs, blank lines, leading/trailing spaces, quotes, backslashes and Unicode", () => {
	const code = '\n\tif True:\n\t\tprint("中文 \\\\ path")  \n    # spaced\n\n';
	assert.deepEqual(extractCodeBlocks(fence(code, "python")), [{ language: "python", text: code }]);
});

test("preserves long unwrapped lines and does not append a newline", () => {
	const code = `printf '%s' '${"x".repeat(800)}'`;
	assert.equal(extractCodeBlocks(fence(code))[0].text, code);
});

test("extracts separate blocks, not prose, inline code, or fence language labels", () => {
	const source = `Run \`not a block\`\n\n${fence("echo one")}\n\nExplanation\n\n${fence("print(2)", "python")}`;
	assert.deepEqual(extractCodeBlocks(source), [{ language: "sh", text: "echo one" }, { language: "python", text: "print(2)" }]);
});

test("supports tilde fences, longer fences, and backticks inside code", () => {
	assert.deepEqual(extractCodeBlocks("~~~js\nconst x = `hello`;\n~~~"), [{ language: "js", text: "const x = `hello`;" }]);
	assert.deepEqual(extractCodeBlocks("````md\n```sh\necho hi\n```\n````"), [{ language: "md", text: "```sh\necho hi\n```" }]);
});

test("handles CommonMark indentation, quoted/list blocks, and indented code", () => {
	assert.equal(extractCodeBlocks("  ```py\n  def run():\n      pass\n  ```")[0].text, "def run():\n    pass");
	assert.equal(extractCodeBlocks("> ```sh\n> echo hi\n> ```")[0].text, "echo hi");
	assert.equal(extractCodeBlocks("- Run:\n\n  ```py\n  def run():\n      pass\n  ```")[0].text, "def run():\n    pass");
	assert.equal(extractCodeBlocks("    one\n        two")[0].text, "one\n    two");
});

test("normalizes CRLF according to the Markdown parser", () => {
	assert.equal(extractCodeBlocks("```sh\r\necho one\r\necho two\r\n```")[0].text, "echo one\necho two");
});

test("ignores truly empty code blocks without trimming whitespace-only code", () => {
	assert.deepEqual(extractCodeBlocks(fence("")), []);
	assert.equal(extractCodeBlocks(fence("  \n\t"))[0].text, "  \n\t");
});

test("defaults to newest code-bearing reply, skips later prose, preserves block order", () => {
	const older = entry(fence("older"));
	const latest = entry(`${fence("first")}\n\n${fence("second")}`);
	const found = collectCodeBlocks([older, latest, entry("No code here.")]);
	assert.deepEqual(found.map((b) => b.text), ["first", "second"]);
	assert.deepEqual(found.map((b) => b.blockNumber), [1, 2]);
	assert.ok(found.every((b) => b.entryId === latest.id));
});

test("excludes user, tool, custom and hidden thinking content", () => {
	const entries = [
		entry(fence("user"), { role: "user" }),
		entry(fence("tool"), { role: "toolResult" }),
		entry(fence("custom"), { role: "custom" }),
		entry("", { content: [{ type: "thinking", thinking: fence("secret") }, { type: "toolCall", name: "bash", arguments: { command: "echo tool" } }] }),
		{ type: "custom", id: "not-a-message", data: fence("metadata") },
	];
	assert.deepEqual(collectCodeBlocks(entries, true), []);
});

test("excludes aborted, errored, truncated, pending and deferred replies", () => {
	const entries = [entry(fence("good")), ...["aborted", "error", "length", "pending", "deferred"].map((stopReason) => entry(fence("incomplete"), { stopReason }))];
	assert.deepEqual(collectCodeBlocks(entries, true).map((b) => b.text), ["good"]);
});

test("supports text in successfully completed tool-use turns and multiple text parts", () => {
	const item = entry("", { stopReason: "toolUse", content: [{ type: "text", text: "Explanation" }, { type: "text", text: fence("safe") }] });
	assert.equal(collectCodeBlocks([item])[0].text, "safe");
});

test("history is newest-reply-first and limited to 100 blocks", () => {
	const entries = Array.from({ length: 110 }, (_, i) => entry(fence(`code-${i}`)));
	const blocks = collectCodeBlocks(entries, true);
	assert.equal(blocks.length, 100);
	assert.equal(blocks[0].text, "code-109");
	assert.equal(blocks.at(-1).text, "code-10");
});

test("registers the slash command without taking over shortcuts or executing commands", () => {
	const commands = new Map();
	extension({ registerCommand: (name, command) => commands.set(name, command) });
	assert.equal(commands.size, 1);
	assert.equal(typeof commands.get("copycode").handler, "function");
});

test("copies a single block directly with exact whitespace", async () => {
	const code = '\tprintf "%s\\n" "hello"  ';
	const h = harness([entry(fence(code))]);
	await h.run();
	assert.deepEqual(h.copied, [code]);
	assert.equal(h.dialogs.length, 0);
	assert.match(h.notices.at(-1).message, /未执行/);
});

test("multiple blocks open a picker and copy only the selected block", async () => {
	const h = harness([entry(`${fence("one")}\n\n${fence("  two")}`)], { selectedIndex: 1 });
	await h.run();
	assert.equal(h.dialogs[0].labels.length, 2);
	assert.deepEqual(h.copied, ["  two"]);
});

test("numeric argument picks a block without a dialog", async () => {
	const h = harness([entry(`${fence("one")}\n\n${fence("two")}`)]);
	await h.run(" 2 ");
	assert.deepEqual(h.copied, ["two"]);
	assert.equal(h.dialogs.length, 0);
});

test("history can select an older message", async () => {
	const h = harness([entry(fence("old")), entry(fence("new"))], { selectedIndex: 1 });
	await h.run("history");
	assert.deepEqual(h.copied, ["old"]);
	assert.match(h.dialogs[0].title, /历史/);
});

test("Esc cancellation leaves clipboard untouched", async () => {
	const h = harness([entry(`${fence("one")}\n\n${fence("two")}`)], { cancel: true });
	await h.run();
	assert.deepEqual(h.copied, []);
	assert.deepEqual(h.notices, []);
});

test("no code gives a warning and never copies explanation prose", async () => {
	const h = harness([entry("Use the `inline` command.")]);
	await h.run();
	assert.deepEqual(h.copied, []);
	assert.equal(h.notices[0].level, "warning");
});

test("invalid and out-of-range arguments do not change the clipboard", async () => {
	for (const argument of ["0", "-1", "2x", "1 2", "all", "2", "999999999999999999999999999"]) {
		const h = harness([entry(fence("one"))]);
		await h.run(argument);
		assert.deepEqual(h.copied, []);
		assert.equal(h.notices.length, 1);
	}
});

test("refuses copying during streaming or outside interactive mode", async () => {
	for (const options of [{ idle: false }, { mode: "rpc", hasUI: true }, { mode: "json", hasUI: false }, { mode: "print", hasUI: false }]) {
		const h = harness([entry(fence("one"))], options);
		await h.run();
		assert.deepEqual(h.copied, []);
		assert.equal(h.notices[0].level, "warning");
	}
});

test("reports clipboard errors without claiming success", async () => {
	const h = harness([entry(fence("one"))], { copyError: "clipboard unavailable" });
	await h.run();
	assert.deepEqual(h.copied, []);
	assert.equal(h.notices.at(-1).level, "error");
	assert.match(h.notices.at(-1).message, /clipboard unavailable/);
});

test("sanitizes terminal controls in previews but does not change clipboard text", async () => {
	const code = "echo \u001b[31m\u0007危险\u202e text";
	const h = harness([entry(`${fence(code)}\n\n${fence("other")}`)]);
	await h.run();
	assert.doesNotMatch(h.dialogs[0].labels[0], /[\u001b\u0007\u202e]/);
	assert.deepEqual(h.copied, [code]);
});

test("loads through the real pi extension loader", async () => {
	const { loadExtensions } = await import(join(piRoot, "dist/core/extensions/loader.js"));
	const extensionPath = join(extensionsDirectory, "copy-code.ts");
	const result = await loadExtensions([extensionPath], projectRoot);
	assert.deepEqual(result.errors, []);
	assert.equal(result.extensions.length, 1);
	assert.ok(result.extensions[0].commands.has("copycode"));
});
