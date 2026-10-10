// 控えを見る(FR-15)。読むだけの画面に、埋めた行の前と後と、控えの全文を出す。
// クリップボードに書くのは「控えの全文をコピー」を押したときだけ(INV-14)。navigator.clipboard はこのファイルだけ。
import { ButtonComponent, Modal, Notice, type App } from "obsidian";
import { renderChanges } from "./confirm";
import { describeFills } from "./fill/plan";
import type { HistoryRecord } from "./fill/history";

export class BackupModal extends Modal {
	constructor(app: App, private readonly rec: HistoryRecord, private readonly mentionTexts: readonly string[],
		private readonly note = "") {
		super(app);
	}

	onOpen(): void {
		const { contentEl, rec } = this;
		this.setTitle("控え(書き換え前の本文)");
		contentEl.addClass("pf-backup-modal");
		contentEl.createDiv({ cls: "pf-path", text: rec.path });
		contentEl.createDiv({ cls: "pf-meta", text: `${rec.at}  ${rec.fills.length} か所` });
		if (this.note) contentEl.createDiv({ cls: "pf-warn", text: this.note });
		contentEl.createEl("h4", { text: "埋めた行の前と後" });
		renderChanges(contentEl, describeFills(rec.before, rec.fills, this.mentionTexts));
		new ButtonComponent(contentEl.createDiv({ cls: "pf-buttons" })).setButtonText("控えの全文をコピー").onClick(() => {
			navigator.clipboard.writeText(rec.before).then(
				() => new Notice("控えの全文をコピーした"),
				() => new Notice("コピーできなかった"),
			);
		});
		contentEl.createEl("pre", { cls: "pf-backup", text: rec.before });
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
