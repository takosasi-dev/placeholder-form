// 確認画面(§9.6・FR-9・D-13)。対象のパス・書き換える欄の数・変わる行の前と後を出し、押したボタンを true / false で返す。
// 取り消しと「履歴をすべて消す」も同じ画面を使う。閉じただけ(Esc など)は false(INV-3)。
import { ButtonComponent, Modal, type App } from "obsidian";
import { preview, type Change } from "./fill/plan";

export interface ConfirmOptions {
	title: string;
	path?: string;
	lead: string;
	changes?: Change[];
	ok: string;
}

/** 「前: 」「後: 」の行を出す(最初の5行まで) */
export function renderChanges(el: HTMLElement, changes: readonly Change[]): void {
	for (const c of changes) {
		const box = el.createDiv({ cls: "pf-change" });
		box.createDiv({ cls: "pf-change-head", text: c.head });
		const rows = (label: string, xs: readonly string[]) =>
			box.createDiv({ cls: "pf-change-rows", text: preview(xs).map((x, i) => (i === 0 ? `${label}${x}` : `    ${x}`)).join("\n") });
		rows("前: ", c.from);
		rows("後: ", c.to);
	}
}

class ConfirmModal extends Modal {
	private decided = false;

	constructor(app: App, private readonly o: ConfirmOptions, private readonly done: (yes: boolean) => void) {
		super(app);
	}

	onOpen(): void {
		const { contentEl, o } = this;
		this.setTitle(o.title);
		contentEl.addClass("pf-confirm");
		if (o.path) contentEl.createDiv({ cls: "pf-path", text: o.path });
		contentEl.createDiv({ text: o.lead });
		renderChanges(contentEl, o.changes ?? []);
		const row = contentEl.createDiv({ cls: "pf-buttons" });
		new ButtonComponent(row).setButtonText(o.ok).setCta().onClick(() => {
			this.decided = true;
			this.done(true);
			this.close();
		});
		new ButtonComponent(row).setButtonText("やめる").onClick(() => this.close());
	}

	onClose(): void {
		this.contentEl.empty();
		if (!this.decided) this.done(false);
	}
}

export function confirmChanges(app: App, o: ConfirmOptions): Promise<boolean> {
	return new Promise((resolve) => new ConfirmModal(app, o, resolve).open());
}
