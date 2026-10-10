// Placeholder Form の入口: ビュー・コマンド3つ・設定タブ・追従のイベントを登録し、フォームの状態と確定・取り消しの流れを持つ(§2)。
// ビューへの参照は持たず、getLeavesOfType で探して描き直させる(§9.4)。書き込みは writer.ts、data.json は store.ts だけ(INV-1)。
// 仕様書に書くのは確認画面で「書き換える」「取り消す」を押したときだけ(INV-3)。
import { normalizePath, Notice, Plugin, type TAbstractFile, type TFile } from "obsidian";
import { BackupModal } from "./backupModal";
import { confirmChanges } from "./confirm";
import { isoLocal, recordState, STATE_LABEL, type HistoryRecord, type RecordState } from "./fill/history";
import { checkInput, describeFills, planFill, type Input } from "./fill/plan";
import { HistoryModal } from "./historyModal";
import { parseOne, sameOrder, type Parsed } from "./parse";
import { inFolder, isTarget } from "./settings";
import { PlaceholderFormSettingTab } from "./settings-tab";
import { fileAt, flushOpenViews, readCached, readFresh } from "./source";
import { movedPath, Store } from "./store";
import { FormView, VIEW_TYPE } from "./view";
import { commitFill, commitUndo, vaultProcess, type WriteDeps } from "./writer";

export interface FormState {
	/** 対象の仕様書。まだ無ければ null */
	path: string | null;
	/** アクティブなファイルが対象外で、前の仕様書のまま(D-17) */
	offTarget: boolean;
	parsed: Parsed | null;
	/** 解析の例外(FR-19) */
	error: string | null;
	inputs: Map<string, string>;
	/** 「同じ名前の欄にも入れる」が ON のキー */
	all: Set<string>;
	/** 欄が無くなった入力(FR-11) */
	orphans: { key: string; value: string }[];
	/** 確定で止まった理由 */
	message: string[];
	/** この仕様書の履歴と状態 */
	records: { rec: HistoryRecord; state: RecordState }[];
}

const emptyForm = (path: string | null = null): FormState => ({
	path, offTarget: false, parsed: null, error: null, inputs: new Map(), all: new Set(), orphans: [], message: [], records: [],
});

const CHANGED = "仕様書が変わったので書かなかった。読み直した";
export const BROKEN = "data.json が読めないので、確定と取り消しはできない(既定値で動いている。data.json は書き換えていない)";

export default class PlaceholderFormPlugin extends Plugin {
	store!: Store;
	form: FormState = emptyForm();
	private followSeq = 0;
	private reloadSeq = 0;
	private idSeq = 0;

	async onload(): Promise<void> {
		this.store = new Store(this, normalizePath);
		await this.store.load();
		if (this.store.broken) new Notice(`Placeholder Form: ${BROKEN}`);
		this.registerView(VIEW_TYPE, (leaf) => new FormView(leaf, this));
		this.addCommand({ id: "open-form", name: "欄の入力フォームを開く", callback: () => void this.openForm() });
		this.addCommand({ id: "undo-last", name: "直前の書き込みを取り消す", callback: () => void this.undoLast() });
		this.addCommand({ id: "open-history", name: "書き込みの履歴と控えを開く", callback: () => new HistoryModal(this.app, this).open() });
		this.addSettingTab(new PlaceholderFormSettingTab(this.app, this));
		this.registerEvent(this.app.workspace.on("active-leaf-change", () => void this.follow()));
		this.registerEvent(this.app.workspace.on("file-open", () => void this.follow()));
		this.registerEvent(this.app.vault.on("modify", (file) => {
			if (file.path === this.form.path) void this.reload();
		}));
		this.registerEvent(this.app.vault.on("rename", (file, oldPath) => void this.onRename(file, oldPath)));
		this.registerEvent(this.app.vault.on("delete", (file) => {
			if (this.form.path !== null && inFolder(this.form.path, file.path)) {
				this.form = emptyForm();
				this.renderViews();
			}
		}));
		this.app.workspace.onLayoutReady(() => void this.follow());
	}

	async openForm(): Promise<void> {
		await this.app.workspace.ensureSideLeaf(VIEW_TYPE, "right", { active: true, reveal: true });
	}

	renderViews(): void {
		for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
			if (leaf.view instanceof FormView) leaf.view.render();
		}
	}

	/** 対象を決める(D-15・D-17・FR-1)。§8 の無い仕様書には、前の対象が §8 を持つ間は移らない */
	private async follow(): Promise<void> {
		const file = this.app.workspace.getActiveFile();
		const f = this.form;
		if (!file) return;
		if (file.path === f.path) return this.setOff(false);
		if (!isTarget(file.path, this.store.settings)) return this.setOff(f.path !== null);
		const token = ++this.followSeq;
		const text = await readCached(this.app, file);
		if (token !== this.followSeq) return;
		const parsed = parseOne(text, this.store.settings.mentionTexts);
		if ("error" in parsed || parsed.has8 || f.path === null || !f.parsed?.has8) await this.setTarget(file.path, text);
		else this.setOff(true);
	}

	private setOff(off: boolean): void {
		if (this.form.offTarget === off) return;
		this.form.offTarget = off;
		this.renderViews();
	}

	private async setTarget(path: string, text?: string): Promise<void> {
		this.form = emptyForm(path);
		const drafts = this.store.settings.saveDrafts ? this.store.data.drafts[path] : undefined;
		for (const [k, v] of Object.entries(drafts ?? {})) this.form.inputs.set(k, v);   // FR-20
		await this.reload(text);
	}

	/** 対象を読み直す(FR-12)。入力は同じキーの欄に残し、キーが無くなった入力は「欄が無くなった入力」へ(FR-11) */
	async reload(given?: string): Promise<void> {
		const path = this.form.path;
		if (path === null) return this.renderViews();
		const token = ++this.reloadSeq;
		const file = fileAt(this.app, path);
		if (!file) {
			this.form = emptyForm();
			return this.renderViews();
		}
		const text = given ?? await readCached(this.app, file);
		const mine = this.store.history.filter((r) => r.path === path);
		const states = await this.statesOf(mine);
		if (token !== this.reloadSeq || this.form.path !== path) return;
		const f = this.form;
		const parsed = parseOne(text, this.store.settings.mentionTexts);
		if ("error" in parsed) {
			f.parsed = null;
			f.error = parsed.error;
		} else {
			f.parsed = parsed;
			f.error = null;
			const keys = new Set(parsed.slots.map((s) => s.key));
			for (const [k, v] of f.inputs) {
				if (keys.has(k)) continue;
				f.inputs.delete(k);
				f.all.delete(k);
				if (v.trim() !== "") f.orphans.push({ key: k, value: v });
			}
		}
		f.records = mine.map((rec) => ({ rec, state: states.get(rec.id) ?? "missing" }));
		this.renderViews();
	}

	/** 記録の状態を、パスごとに1回 read して決める(§9.7) */
	async statesOf(records: readonly HistoryRecord[]): Promise<Map<string, RecordState>> {
		const texts = new Map<string, string | null>();
		for (const path of new Set(records.map((r) => r.path))) {
			const file = fileAt(this.app, path);
			texts.set(path, file ? await readFresh(this.app, file).catch(() => null) : null);
		}
		return new Map(records.map((r) => [r.id, recordState(r, texts.get(r.path) ?? null)]));
	}

	private async onRename(file: TAbstractFile, oldPath: string): Promise<void> {
		const f = this.form;
		const moved = f.path === null ? null : movedPath(f.path, oldPath, file.path);
		await this.store.renamePath(oldPath, file.path).catch(() => new Notice("履歴のパスを直せなかった"));
		if (moved !== null && moved !== f.path) {
			f.path = moved;
			await this.reload();
		}
	}

	// ---- 入力(ビューから呼ぶ) ----

	inputList(): Input[] {
		return [...this.form.inputs].map(([key, value]) => ({ key, value, all: this.form.all.has(key) }));
	}

	setInput(key: string, value: string): void {
		if (value === "") this.form.inputs.delete(key);
		else this.form.inputs.set(key, value);
	}

	setAll(key: string, on: boolean): void {
		if (on) this.form.all.add(key);
		else this.form.all.delete(key);
	}

	/** その欄の入力が受け付けられない理由(FR-6)。入力なし・問題なしは null */
	reasonFor(key: string): string | null {
		const parsed = this.form.parsed;
		const value = this.form.inputs.get(key) ?? "";
		if (!parsed || value === "") return null;
		const r = checkInput(parsed.slots, { key, value, all: this.form.all.has(key) }, this.store.settings.tableLineBreak);
		return typeof r === "string" ? null : r.reason;
	}

	/** 入力の数(空白だけを除く) */
	inputCount(): number {
		return [...this.form.inputs.values()].filter((v) => v.trim() !== "").length;
	}

	/** 下書きの保存(FR-20)。入力欄から離れたとき */
	async saveDraft(): Promise<void> {
		const path = this.form.path;
		if (path === null || !this.store.settings.saveDrafts || this.store.broken) return;
		const values = Object.fromEntries([...this.form.inputs].filter(([, v]) => v.trim() !== ""));
		await this.store.setDrafts(path, values).catch(() => new Notice("下書きを保存できなかった"));
	}

	clearInputs(): void {
		const f = this.form;
		f.inputs.clear();
		f.all.clear();
		f.orphans = [];
		f.message = [];
		void this.saveDraft();
		this.renderViews();
	}

	// ---- 確定・取り消し ----

	private deps(file: TFile): WriteDeps {
		return {
			saveRecord: (rec) => this.store.addRecord(rec),
			dropRecord: (id) => this.store.dropRecord(id),
			process: vaultProcess(this.app, file),
		};
	}

	/** 確定(FR-8〜FR-11): 保存 → read → 並びの確かめ → 計画と構造の検査 → 確認画面 → 控え → process */
	async submit(): Promise<void> {
		const f = this.form;
		const s = this.store.settings;
		if (this.store.broken) {
			new Notice(BROKEN);
			return;
		}
		const path = f.path;
		const formSlots = f.parsed?.slots;
		const file = path === null ? null : fileAt(this.app, path);
		if (path === null || !file || !formSlots || f.parsed?.unclosedAt !== null) return;
		await flushOpenViews(this.app, path);
		const before = await readFresh(this.app, file);
		const now = parseOne(before, s.mentionTexts);
		if ("error" in now || !sameOrder(formSlots, now.slots)) {
			new Notice(CHANGED);
			await this.reload(before);
			return;
		}
		const plan = planFill(before, now, this.inputList(), s);
		if (!plan.ok) {
			f.message = plan.problems.map((p) => (p.key === null ? p.reason : `${p.key}: ${p.reason}`));
			new Notice(`書かなかった: ${f.message.join(" / ")}`);
			this.renderViews();
			return;
		}
		f.message = [];
		const yes = await confirmChanges(this.app, {
			title: "欄を書き換える", path, ok: "書き換える",
			lead: `${plan.fills.length} か所を書き換える。書く前に、今の本文全体を控えとして保存する。`,
			changes: describeFills(before, plan.fills, s.mentionTexts),
		});
		if (!yes) return;
		const rec: HistoryRecord = { id: `${Date.now()}-${++this.idSeq}`, at: isoLocal(new Date()), path, before, fills: plan.fills };
		const r = await commitFill(this.deps(file), before, plan.after, rec);
		if (r === "backup-failed") {
			new Notice("控えを保存できなかったので書かなかった");
			return;
		}
		if (r === "ok") {
			new Notice(`${plan.fills.length} か所を埋めた`);
			if (this.form.path === path) {
				this.form.inputs.clear();
				this.form.all.clear();
				await this.saveDraft();
			}
		} else {
			new Notice(r === "changed" ? CHANGED : "書けたか分からない。履歴で状態を見て");
		}
		await this.reload();
	}

	async undoLast(): Promise<void> {
		const rec = this.store.history[0];
		if (!rec) {
			new Notice("履歴が無い");
			return;
		}
		await this.undo(rec);
	}

	/** 取り消し(FR-14・D-9)。今の本文が書き込み直後と同じときだけ、確認の後に控えに戻す */
	async undo(rec: HistoryRecord): Promise<void> {
		if (this.store.broken) {
			new Notice(BROKEN);
			return;
		}
		const file = fileAt(this.app, rec.path);
		if (file) await flushOpenViews(this.app, rec.path);
		const current = file ? await readFresh(this.app, file) : null;
		const state = recordState(rec, current);
		if (state !== "undoable" || !file || current === null) {
			this.showBackup(rec, `取り消せない: ${STATE_LABEL[state]}`);
			return;
		}
		const yes = await confirmChanges(this.app, {
			title: "書き込みを取り消す", path: rec.path, ok: "取り消す",
			lead: `${rec.fills.length} か所を取り消して、控えの本文に戻す。`,
			changes: describeFills(rec.before, rec.fills, this.store.settings.mentionTexts, true),
		});
		if (!yes) return;
		const r = await commitUndo(this.deps(file), rec, current);
		new Notice(r === "ok" ? "取り消した" : r === "changed" ? "仕様書が変わったので取り消さなかった" : "書けたか分からない。履歴で状態を見て");
		await this.reload();
	}

	showBackup(rec: HistoryRecord, note = ""): void {
		new BackupModal(this.app, rec, this.store.settings.mentionTexts, note).open();
	}
}
