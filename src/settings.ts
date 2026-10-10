// 設定と data.json の型・既定値(DEFAULTS)・読み込みの補い・対象の判定(§9.2・D-15)。私の vault 固有の文字はここにだけ書く(INV-13)。
// obsidian を import しない(テストで読む)。パスの正規化は呼び手が normalizePath を渡す。設定タブは settings-tab.ts。
// 壊れた data.json・違う schemaVersion は既定値で動かし、problem を返す(呼び手は上書きしない)。
import { isRecord, type HistoryRecord } from "./fill/history";

export interface Settings {
	specFolders: string[];
	excludePaths: string[];
	mentionTexts: string[];
	tableLineBreak: string;
	historyLimit: number;
	saveDrafts: boolean;
}

export interface PluginData {
	schemaVersion: 1;
	settings: Settings;
	/** 新しい順 */
	history: HistoryRecord[];
	/** パス → キー → 値。saveDrafts が false なら空 */
	drafts: Record<string, Record<string, string>>;
}

export const DEFAULTS: Settings = {
	specFolders: ["仕様書MDファイル"],
	excludePaths: [],
	mentionTexts: ["...", "…"],     // BlockerBoard と同じ。変えるときは両方を変える
	tableLineBreak: "<br>",           // 仮決め(§8.5 は未記入。AC-14 が改行に見えることを求めている)
	historyLimit: 20,                 // 仮決め(§8.7 の仮の値)
	saveDrafts: false,
};

export function emptyData(): PluginData {
	return { schemaVersion: 1, settings: JSON.parse(JSON.stringify(DEFAULTS)) as Settings, history: [], drafts: {} };
}

/** Foo は Foo 自身と Foo/ の下だけに当たる(FooBar/ には当たらない) */
export const inFolder = (path: string, folder: string): boolean => path === folder || path.startsWith(`${folder}/`);

/** 対象のパス: specFolders の下の md で、excludePaths に当たらない(D-15)。§8 があるかは呼び手が見る */
export function isTarget(path: string, s: Settings): boolean {
	return path.endsWith(".md") && s.specFolders.some((f) => path.startsWith(`${f}/`)) && !s.excludePaths.some((e) => inFolder(path, e));
}

const isStrList = (x: unknown): x is string[] => Array.isArray(x) && x.every((v) => typeof v === "string");

export function normalizeData(raw: unknown, norm: (p: string) => string): { data: PluginData; problem: boolean } {
	const data = emptyData();
	if (raw === null || raw === undefined) return { data, problem: false };
	const broken = { data: emptyData(), problem: true };
	if (typeof raw !== "object" || Array.isArray(raw)) return broken;
	const r = raw as Record<string, unknown>;
	if (r.schemaVersion !== 1) return broken;
	const s = (typeof r.settings === "object" && r.settings !== null ? r.settings : {}) as Record<string, unknown>;
	const d = data.settings;
	const paths = (xs: string[]) => xs.map((x) => x.trim()).filter((x) => x !== "").map(norm);
	if (isStrList(s.specFolders)) d.specFolders = paths(s.specFolders);
	if (isStrList(s.excludePaths)) d.excludePaths = paths(s.excludePaths);
	if (isStrList(s.mentionTexts)) d.mentionTexts = s.mentionTexts;
	if (typeof s.tableLineBreak === "string") d.tableLineBreak = s.tableLineBreak;
	if (typeof s.historyLimit === "number" && Number.isInteger(s.historyLimit) && s.historyLimit >= 1) d.historyLimit = s.historyLimit;
	if (typeof s.saveDrafts === "boolean") d.saveDrafts = s.saveDrafts;
	if (r.history !== undefined) {
		if (!Array.isArray(r.history) || !r.history.every(isRecord)) return broken;
		data.history = r.history;
	}
	if (r.drafts !== undefined) {
		if (typeof r.drafts !== "object" || r.drafts === null || Array.isArray(r.drafts)) return broken;
		for (const [path, kv] of Object.entries(r.drafts as Record<string, unknown>)) {
			if (typeof kv !== "object" || kv === null || Array.isArray(kv)) return broken;
			const vals = Object.entries(kv as Record<string, unknown>);
			if (!vals.every(([, v]) => typeof v === "string")) return broken;
			data.drafts[path] = Object.fromEntries(vals) as Record<string, string>;
		}
	}
	return { data, problem: false };
}
