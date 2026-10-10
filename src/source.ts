// Obsidian の API で仕様書を読むのはこのファイルだけ(§2)。フォームは cachedRead、書く直前と履歴の状態は read で読む。
// 書く前に、対象を開いている MarkdownView 全部の save() を待つ(D-6)。書き込み系のメソッドは呼ばない(INV-1)。
import { MarkdownView, type App, type TFile } from "obsidian";

export function fileAt(app: App, path: string): TFile | null {
	return app.vault.getFileByPath(path);
}

export function readCached(app: App, file: TFile): Promise<string> {
	return app.vault.cachedRead(file);
}

export function readFresh(app: App, file: TFile): Promise<string> {
	return app.vault.read(file);
}

/** path を開いている MarkdownView を全部保存する(2つのペインで開いていれば両方) */
export async function flushOpenViews(app: App, path: string): Promise<void> {
	const views: MarkdownView[] = [];
	app.workspace.iterateAllLeaves((leaf) => {
		if (leaf.view instanceof MarkdownView && leaf.view.file?.path === path) views.push(leaf.view);
	});
	await Promise.all(views.map((v) => v.save()));
}
