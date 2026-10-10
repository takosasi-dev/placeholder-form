// 書き込みの履歴の一覧(FR-16)。記録ごとに時刻・パス・欄の数・状態・「取り消す」(取り消せるときだけ)・「控えを見る」。
// 状態は開くたびに read で決める(§9.7)。取り消したら描き直す。
import { ButtonComponent, Modal, type App } from "obsidian";
import { STATE_LABEL } from "./fill/history";
import type PlaceholderFormPlugin from "./main";

export const timeText = (iso: string): string => {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return iso;
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export class HistoryModal extends Modal {
	constructor(app: App, private readonly plugin: PlaceholderFormPlugin) {
		super(app);
	}

	onOpen(): void {
		this.setTitle("書き込みの履歴と控え");
		this.contentEl.addClass("pf-history-modal");
		void this.draw();
	}

	private async draw(): Promise<void> {
		const p = this.plugin;
		const records = p.store.history;
		const states = await p.statesOf(records);
		const el = this.contentEl;
		el.empty();
		if (!records.length) {
			el.createDiv({ text: "履歴は無い" });
			return;
		}
		for (const rec of records) {
			const state = states.get(rec.id) ?? "missing";
			const row = el.createDiv({ cls: "pf-record" });
			row.createDiv({ text: `${timeText(rec.at)}  ${rec.fills.length} か所  ${STATE_LABEL[state]}` });
			row.createDiv({ cls: "pf-path", text: rec.path });
			const btns = row.createDiv({ cls: "pf-buttons" });
			if (state === "undoable" && !p.store.broken) {
				new ButtonComponent(btns).setButtonText("取り消す").onClick(async () => {
					await p.undo(rec);
					await this.draw();
				});
			}
			new ButtonComponent(btns).setButtonText("控えを見る").onClick(() => p.showBackup(rec));
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
