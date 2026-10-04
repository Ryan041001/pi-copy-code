import {
	copyToClipboard,
	type ExtensionAPI,
	type ExtensionContext,
	type SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { Marked, truncateToWidth } from "@earendil-works/pi-tui";

export interface CodeBlock {
	text: string;
	language: string;
}

export interface SessionCodeBlock extends CodeBlock {
	entryId: string;
	timestamp: string;
	blockNumber: number;
}

const markdown = new Marked();
const HISTORY_LIMIT = 100;
const USAGE = "用法：/copycode（选择最近回复中的代码） · /copycode 2 · /copycode history";

/** Parse Markdown source, never terminal-rendered lines. Do not trim code. */
export function extractCodeBlocks(source: string): CodeBlock[] {
	const blocks: CodeBlock[] = [];
	markdown.walkTokens(markdown.lexer(source), (token) => {
		if (token.type === "code" && typeof token.text === "string" && token.text.length > 0) {
			blocks.push({
				text: token.text,
				language: typeof token.lang === "string" ? token.lang.split(/\s+/)[0] : "",
			});
		}
	});
	return blocks;
}

/** Only the active branch, assistant text, and successfully finished messages. */
export function collectCodeBlocks(entries: readonly SessionEntry[], history = false): SessionCodeBlock[] {
	const result: SessionCodeBlock[] = [];
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i];
		if (entry.type !== "message" || entry.message.role !== "assistant") continue;
		const message = entry.message;
		if (message.stopReason !== "stop" && message.stopReason !== "toolUse") continue;
		const source = message.content
			.filter((part) => part.type === "text")
			.map((part) => part.text)
			.join("\n");
		const blocks = extractCodeBlocks(source);
		for (let j = 0; j < blocks.length; j++) {
			result.push({ ...blocks[j], entryId: entry.id, timestamp: entry.timestamp, blockNumber: j + 1 });
			if (history && result.length === HISTORY_LIMIT) return result;
		}
		if (!history && blocks.length > 0) break;
	}
	return result;
}

/** Sanitize previews only; the actual clipboard text is never sanitized/reformatted. */
function preview(text: string, width: number): string {
	return truncateToWidth(text.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " "), width);
}

function timeLabel(timestamp: string): string {
	const date = new Date(timestamp);
	return Number.isNaN(date.getTime()) ? "未知时间" : date.toLocaleString();
}

function blockLabel(block: SessionCodeBlock, index: number, history: boolean): string {
	const language = preview(block.language || "text", 18);
	const firstLine = block.text.split("\n").find((line) => line.trim().length > 0) ?? "（空白代码）";
	const origin = history ? `${timeLabel(block.timestamp)} · ` : "";
	return `${index + 1}. ${origin}${language} · ${block.text.split("\n").length} 行 · ${preview(firstLine, 65)}`;
}

// Clipboard injection lets tests verify exact contents without altering the user's clipboard.
export function createCopyCodeHandler(copy: (text: string) => Promise<void> = copyToClipboard) {
	return async (args: string, ctx: ExtensionContext): Promise<void> => {
		if (ctx.mode !== "tui" || !ctx.hasUI) {
			ctx.ui.notify("/copycode 需要在交互式 TUI 中使用。", "warning");
			return;
		}
		if (!ctx.isIdle()) {
			ctx.ui.notify("请等回复完成后再复制，避免复制到不完整的代码。", "warning");
			return;
		}

		const argument = args.trim();
		if (argument && argument !== "history" && !/^[1-9]\d*$/.test(argument)) {
			ctx.ui.notify(USAGE, "info");
			return;
		}

		try {
			const history = argument === "history";
			const blocks = collectCodeBlocks(ctx.sessionManager.getBranch(), history);
			if (blocks.length === 0) {
				ctx.ui.notify("当前会话分支中还没有可复制的代码块。只复制已完成的助手回复，不读取工具输出或思考内容。", "warning");
				return;
			}

			let chosen: SessionCodeBlock | undefined;
			if (argument && !history) {
				const index = Number(argument) - 1;
				chosen = blocks[index];
				if (!chosen) {
					ctx.ui.notify(`最近含代码的回复只有 ${blocks.length} 段代码，请选择 1–${blocks.length}。`, "warning");
					return;
				}
			} else if (blocks.length === 1 && !history) {
				chosen = blocks[0];
			} else {
				const labels = blocks.map((block, i) => blockLabel(block, i, history));
				const title = history
					? `复制历史代码 · 最近 ${blocks.length} 段 · 仅复制，不执行`
					: `复制代码 · 最近含代码的回复（${timeLabel(blocks[0].timestamp)}）· Enter 复制 / Esc 取消`;
				const selected = await ctx.ui.select(title, labels);
				if (selected === undefined) return;
				chosen = blocks[labels.indexOf(selected)];
			}
			if (!chosen) return;

			await copy(chosen.text);
			ctx.ui.notify(
				`已复制 ${preview(chosen.language || "text", 18)} 代码块 #${chosen.blockNumber}（${timeLabel(chosen.timestamp)}），保留代码缩进，未执行。`,
				"info",
			);
		} catch (error) {
			const detail = error instanceof Error ? error.message : String(error);
			ctx.ui.notify(`复制失败：${preview(detail, 160)}`, "error");
		}
	};
}

export default function copyCodeExtension(pi: ExtensionAPI): void {
	pi.registerCommand("copycode", {
		description: "复制最近回复的代码块，保留缩进；可用数字选择，或 history 浏览历史",
		handler: createCopyCodeHandler(),
	});
}
