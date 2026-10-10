// 右サイドバーのフォーム(§9.4・FR-1・FR-4〜FR-6)。小節ごとに欄の名前・種類・行番号・文脈・入力欄を並べ、確定と履歴を出す。
// 要素は createEl / createDiv だけで作り、本文と入れた値は文字として出す(INV-11)。状態は plugin が持ち、ここは描くだけ。
// 入力欄は全部複数行の TextAreaComponent(D-10)。小節の開け閉めは描き直しても保つ。
import { ButtonComponent, ItemView, TextAreaComponent, type WorkspaceLeaf } from "obsidian";
import { STATE_LABEL } from "./fill/history";
import { timeText } from "./historyModal";
import type PlaceholderFormPlugin from "./main";
import { openAt } from "./nav";
import { groupBySub, type Parsed, type Slot } from "./parse";
import { KIND_LABEL, KIND_ORDER } from "./parse/kinds";

export const VIEW_TYPE = "placeholder-form-panel";

const NAME_SHAPE = /^[A-Z0-9_]+$/;

export class FormView extends ItemView {
	private closedSubs = new Set<string>();   // open という名前の欄は View の内部と被るので使わない
	private submitBtn: ButtonComponent | null = null;

	constructor(leaf: WorkspaceLeaf, private readonly plugin: PlaceholderFormPlugin) {
		super(leaf);
	}

	getViewType(): string { return VIEW_TYPE; }
	getDisplayText(): string { return "欄の入力フォーム"; }
	getIcon(): string { return "text-cursor-input"; }

	async onOpen(): Promise<void> {
		this.render();
	}

	render(): void {
		const p = this.plugin;
		const f = p.form;
		const root = this.contentEl;
		root.empty();
		root.addClass("pf-panel");
		this.submitBtn = null;
		if (f.path === null) {
			root.createDiv({ cls: "pf-note", text: "仕様書を開いて" });
			return;
		}
		root.createDiv({ cls: "pf-path", text: `対象: ${f.path}` });
		if (f.offTarget) root.createDiv({ cls: "pf-note", text: "対象外のファイル。前の仕様書のまま" });
		if (p.store.broken) root.createDiv({ cls: "pf-warn", text: "data.json が読めないので、確定と取り消しはできない" });
		const parsed = f.parsed;
		if (f.error !== null) root.createDiv({ cls: "pf-warn", text: `読めなかった: ${f.path}: ${f.error}` });
		else if (parsed && !parsed.has8) root.createDiv({ cls: "pf-note", text: "§8 が無い" });
		else if (parsed && !parsed.slots.length) root.createDiv({ cls: "pf-note", text: "§8 に欄が無い(埋まっているか、欄の形が違う)" });
		else if (parsed) this.renderForm(root, parsed);
		this.renderOrphans(root);
		this.renderHistory(root, parsed?.unclosedAt != null);
	}

	private renderForm(root: HTMLElement, parsed: Parsed): void {
		const p = this.plugin;
		const counts = KIND_ORDER.map((k) => `${KIND_LABEL[k]} ${parsed.slots.filter((s) => s.kind === k).length}`).join("・");
		root.createDiv({ cls: "pf-summary", text: `§8 の欄 ${parsed.slots.length}(${counts})/ §8 の外 ${parsed.outside.length}(書き換えない)` });
		const locked = parsed.unclosedAt !== null;
		if (locked) root.createDiv({ cls: "pf-warn", text: `${(parsed.unclosedAt ?? 0) + 1} 行目からのコードブロックが閉じていない` });
		for (const g of groupBySub(parsed.slots)) {
			const det = root.createEl("details", { cls: "pf-sub" });
			det.open = !this.closedSubs.has(g.sub);
			det.addEventListener("toggle", () => {
				if (det.open) this.closedSubs.delete(g.sub);
				else this.closedSubs.add(g.sub);
			});
			det.createEl("summary", { text: `${g.sub}(${g.slots.length})` });
			for (const slot of g.slots) this.renderSlot(det, slot, parsed);
		}
		const row = root.createDiv({ cls: "pf-buttons" });
		this.submitBtn = new ButtonComponent(row).setCta().setDisabled(locked || p.store.broken).onClick(() => void p.submit());
		this.updateSubmit();
		new ButtonComponent(row).setButtonText("入力を消す").onClick(() => p.clearInputs());
		for (const m of p.form.message) root.createDiv({ cls: "pf-warn", text: m });
	}

	private updateSubmit(): void {
		this.submitBtn?.setButtonText(`確定(入力 ${this.plugin.inputCount()} 件)`);
	}

	private renderSlot(parent: HTMLElement, slot: Slot, parsed: Parsed): void {
		const p = this.plugin;
		const box = parent.createDiv({ cls: "pf-slot" });
		const head = box.createDiv({ cls: "pf-slot-head" });
		const same = parsed.slots.filter((s) => s.inner === slot.inner);
		const name = slot.inner.trim() === "" ? "(名前なし)" : slot.inner;
		const link = head.createEl("a", { cls: "pf-name", text: same.length > 1 ? `${name} #${slot.nth}` : name });
		link.addEventListener("click", () => {
			if (p.form.path !== null) void openAt(this.app, p.form.path, slot.line);
		});
		if (!NAME_SHAPE.test(slot.inner)) head.createSpan({ cls: "pf-tag", text: "名前の形でない" });
		head.createSpan({ cls: "pf-meta", text: `${KIND_LABEL[slot.kind]}  ${slot.line + 1} 行目` });
		if (slot.context) box.createDiv({ cls: "pf-context", text: slot.context });

		const ta = new TextAreaComponent(box).setValue(p.form.inputs.get(slot.key) ?? "");
		ta.inputEl.rows = 2;
		ta.inputEl.addClass("pf-input");
		const reason = box.createDiv({ cls: "pf-reason" });
		const showReason = () => reason.setText(p.reasonFor(slot.key) ?? "");
		ta.onChange((v) => {
			p.setInput(slot.key, v);
			showReason();
			this.updateSubmit();
		});
		ta.inputEl.addEventListener("blur", () => void p.saveDraft());

		if (same.length > 1) {
			const label = box.createEl("label", { cls: "pf-all" });
			const cb = label.createEl("input", { type: "checkbox" });
			cb.checked = p.form.all.has(slot.key);
			cb.addEventListener("change", () => {
				p.setAll(slot.key, cb.checked);
				showReason();
			});
			label.appendText(`同じ名前の欄にも入れる(ほか ${same.length - 1} か所)`);
		}
		const outside = parsed.outside.filter((o) => o.inner === slot.inner);
		if (outside.length) {
			box.createDiv({ cls: "pf-note", text: `§8 の外に ${outside.length} か所(行 ${outside.map((o) => o.line + 1).join(", ")})。書き換えない` });
		}
		showReason();
	}

	private renderOrphans(root: HTMLElement): void {
		const orphans = this.plugin.form.orphans;
		const det = root.createEl("details", { cls: "pf-sub" });
		det.createEl("summary", { text: `欄が無くなった入力(${orphans.length})` });
		for (const o of orphans) {
			det.createDiv({ cls: "pf-meta", text: o.key });
			const ta = new TextAreaComponent(det).setValue(o.value);
			ta.inputEl.readOnly = true;
			ta.inputEl.addClass("pf-input");
		}
	}

	private renderHistory(root: HTMLElement, locked: boolean): void {
		const p = this.plugin;
		const records = p.form.records;
		const det = root.createEl("details", { cls: "pf-sub" });
		det.createEl("summary", { text: `この仕様書の履歴(${records.length})` });
		for (const { rec, state } of records) {
			const row = det.createDiv({ cls: "pf-record" });
			row.createSpan({ text: `${timeText(rec.at)}  ${rec.fills.length} か所  ${STATE_LABEL[state]}` });
			if (state === "undoable" && !locked && !p.store.broken) {
				new ButtonComponent(row).setButtonText("取り消す").onClick(() => void p.undo(rec));
			}
			new ButtonComponent(row).setButtonText("控えを見る").onClick(() => p.showBackup(rec));
		}
	}
}
