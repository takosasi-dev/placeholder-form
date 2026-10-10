// data.json(設定・履歴と控え・下書き)の読み書き。saveData を呼ぶのはこのファイルだけ(INV-1)。
// data.json が壊れている・schemaVersion が違うときは broken にして一切保存しない(§9.2。確定と取り消しは呼び手が無効にする)。
// 保存が失敗したら、メモリの中身も保存前に戻して例外を投げる(控えが無いまま書かないため。INV-4)。
import { pushRecord, type HistoryRecord } from "./fill/history";
import { normalizeData, type PluginData, type Settings } from "./settings";

/** oldPath(ファイルかフォルダ)が newPath に変わったときの p の新しいパス */
export const movedPath = (p: string, oldPath: string, newPath: string): string =>
	p === oldPath ? newPath : p.startsWith(`${oldPath}/`) ? newPath + p.slice(oldPath.length) : p;

export interface DataHost {
	loadData(): Promise<unknown>;
	saveData(data: unknown): Promise<void>;
}

export class Store {
	data: PluginData;
	broken = false;

	constructor(private readonly host: DataHost, private readonly norm: (p: string) => string) {
		this.data = normalizeData(null, norm).data;
	}

	get settings(): Settings { return this.data.settings; }
	get history(): HistoryRecord[] { return this.data.history; }

	async load(): Promise<void> {
		let raw: unknown = null;
		try {
			raw = await this.host.loadData();
		} catch {
			this.broken = true;
			return;
		}
		const { data, problem } = normalizeData(raw, this.norm);
		this.data = data;
		this.broken = problem;
	}

	/** 変えてから保存する。保存できなければ元に戻して投げる */
	private async change(fn: (d: PluginData) => void): Promise<void> {
		if (this.broken) throw new Error("data.json が読めないので保存しない");
		const prev = this.data;
		const next = { ...prev, history: [...prev.history], drafts: { ...prev.drafts }, settings: { ...prev.settings } };
		fn(next);
		this.data = next;
		try {
			await this.host.saveData(next);
		} catch (e) {
			this.data = prev;
			throw e;
		}
	}

	addRecord(rec: HistoryRecord): Promise<void> {
		return this.change((d) => { d.history = pushRecord(d.history, rec, d.settings.historyLimit); });
	}

	dropRecord(id: string): Promise<void> {
		return this.change((d) => { d.history = d.history.filter((r) => r.id !== id); });
	}

	clearHistory(): Promise<void> {
		return this.change((d) => { d.history = []; });
	}

	/** rename で履歴と下書きのパスを直す(FR-12)。フォルダの rename なら、その下のパスを全部直す */
	async renamePath(oldPath: string, newPath: string): Promise<void> {
		const moved = (p: string) => movedPath(p, oldPath, newPath);
		const hit = (p: string) => moved(p) !== p;
		if (!this.data.history.some((r) => hit(r.path)) && !Object.keys(this.data.drafts).some(hit)) return;
		await this.change((d) => {
			d.history = d.history.map((r) => (hit(r.path) ? { ...r, path: moved(r.path) } : r));
			d.drafts = Object.fromEntries(Object.entries(d.drafts).map(([p, v]) => [moved(p), v]));
		});
	}

	saveSettings(next: Settings): Promise<void> {
		return this.change((d) => {
			d.settings = next;
			if (!next.saveDrafts) d.drafts = {};
		});
	}

	setDrafts(path: string, values: Record<string, string>): Promise<void> {
		return this.change((d) => {
			if (Object.keys(values).length) d.drafts[path] = values;
			else delete d.drafts[path];
		});
	}
}
