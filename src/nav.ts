// 欄の名前を押したとき、対象の仕様書を開いてその行(0 始まり)にカーソルを置き画面に出す(FR-18)。
// 方法は §8.3 の仮決め: MarkdownView の editor の setCursor と scrollIntoView(BlockerBoard §8.6 と同じ候補)。
import { MarkdownView, Notice, type App } from "obsidian";
import { fileAt } from "./source";

export async function openAt(app: App, path: string, line: number): Promise<void> {
	const file = fileAt(app, path);
	if (!file) {
		new Notice(`ファイルが見つからない: ${path}`);
		return;
	}
	const leaf = app.workspace.getLeaf(false);
	await leaf.openFile(file);
	if (!(leaf.view instanceof MarkdownView)) return;
	const editor = leaf.view.editor;
	const pos = { line: Math.max(0, Math.min(line, editor.lineCount() - 1)), ch: 0 };
	editor.setCursor(pos);
	editor.scrollIntoView({ from: pos, to: pos }, true);
}
