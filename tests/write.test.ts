// 書き込みの手順(AC-9)・取り消しの状態と上限(AC-10)・data.json の読み込み(§9.2)。Obsidian の代わりに偽の関数を使う。
import { describe, expect, it } from "vitest";
import { isoLocal, recordState, type HistoryRecord } from "../src/fill/history";
import { planFill } from "../src/fill/plan";
import { parseSpec } from "../src/parse";
import { DEFAULTS, isTarget, normalizeData } from "../src/settings";
import { movedPath, Store, type DataHost } from "../src/store";
import { commitFill, commitUndo, type Process } from "../src/writer";
import { SAMPLE } from "./sample";

const mt = DEFAULTS.mentionTexts;
const norm = (p: string) => p.replace(/\/+$/, "");

/** 偽の vault と data.json。呼ばれた順を log に積む */
function fakes(opts: { saveFails?: boolean } = {}) {
	const log: string[] = [];
	const file = { text: SAMPLE };
	let saved: unknown = null;
	const host: DataHost = {
		loadData: () => Promise.resolve(saved),
		saveData: (d) => {
			log.push("saveData");
			if (opts.saveFails) return Promise.reject(new Error("disk full"));
			saved = JSON.parse(JSON.stringify(d));
			return Promise.resolve();
		},
	};
	const read = () => {
		log.push("read");
		return Promise.resolve(file.text);
	};
	const returned: string[] = [];
	const process: Process = (fn) => {
		log.push("process");
		const out = fn(file.text);           // 例外ならここで投げ、書かない
		returned.push(out);
		file.text = out;
		return Promise.resolve(out);
	};
	return { log, file, host, read, process, returned };
}

function prepare(before: string, value = "1.14.4"): { after: string; rec: HistoryRecord } {
	const plan = planFill(before, parseSpec(before, mt), [{ key: "A1#1", value, all: false }], { tableLineBreak: "<br>", mentionTexts: mt });
	if (!plan.ok) throw new Error("計画できない");
	return { after: plan.after, rec: { id: `${Date.now()}-1`, at: isoLocal(new Date()), path: "仕様/a.md", before, fills: plan.fills } };
}

describe("書き込みの手順(INV-4・INV-5・FR-11)", () => {
	it("呼ばれる順は read → saveData → process", async () => {
		const k = fakes();
		const store = new Store(k.host, norm);
		const before = await k.read();
		const { after, rec } = prepare(before);
		const r = await commitFill({ saveRecord: (x) => store.addRecord(x), dropRecord: (id) => store.dropRecord(id), process: k.process }, before, after, rec);
		expect(r).toBe("ok");
		expect(k.log).toEqual(["read", "saveData", "process"]);
		expect(k.file.text).toBe(after);
		expect(store.history[0]?.before).toBe(before);
	});

	it("saveData が例外なら process は呼ばれず、記録も残らない", async () => {
		const k = fakes({ saveFails: true });
		const store = new Store(k.host, norm);
		const before = await k.read();
		const { after, rec } = prepare(before);
		const r = await commitFill({ saveRecord: (x) => store.addRecord(x), dropRecord: (id) => store.dropRecord(id), process: k.process }, before, after, rec);
		expect(r).toBe("backup-failed");
		expect(k.log).not.toContain("process");
		expect(k.file.text).toBe(SAMPLE);
		expect(store.history).toEqual([]);
	});

	it("process に違う本文が来たら例外で止め、置き換えた本文を返さず、足した記録を消す", async () => {
		const k = fakes();
		const store = new Store(k.host, norm);
		const before = await k.read();
		const { after, rec } = prepare(before);
		k.file.text = `${SAMPLE}\n追記`;                  // 確認画面の間に Claude が書いた
		const r = await commitFill({ saveRecord: (x) => store.addRecord(x), dropRecord: (id) => store.dropRecord(id), process: k.process }, before, after, rec);
		expect(r).toBe("changed");
		expect(k.returned).toEqual([]);
		expect(k.file.text).toBe(`${SAMPLE}\n追記`);
		expect(store.history).toEqual([]);
	});

	it("process が別の理由で落ちたら記録は残す", async () => {
		const k = fakes();
		const store = new Store(k.host, norm);
		const { after, rec } = prepare(SAMPLE);
		const r = await commitFill({ saveRecord: (x) => store.addRecord(x), dropRecord: (id) => store.dropRecord(id),
			process: () => Promise.reject(new Error("EBUSY")) }, SAMPLE, after, rec);
		expect(r).toBe("unknown");
		expect(store.history.length).toBe(1);
	});
});

describe("取り消しと履歴(FR-13・FR-14)", () => {
	it("状態が4つとも出る", () => {
		const { after, rec } = prepare(SAMPLE);
		expect(recordState(rec, after)).toBe("undoable");
		expect(recordState(rec, SAMPLE)).toBe("unwritten");
		expect(recordState(rec, `${after}x`)).toBe("changed");
		expect(recordState(rec, null)).toBe("missing");
	});

	it("取り消せるときだけ控えに戻り、記録が消える", async () => {
		const k = fakes();
		const store = new Store(k.host, norm);
		const { after, rec } = prepare(SAMPLE);
		await store.addRecord(rec);
		k.file.text = after;
		const deps = { dropRecord: (id: string) => store.dropRecord(id), process: k.process };
		expect(await commitUndo(deps, rec, `${after}x`)).toBe("changed");
		expect(k.file.text).toBe(after);
		expect(await commitUndo(deps, rec, after)).toBe("ok");
		expect(k.file.text).toBe(SAMPLE);
		expect(store.history).toEqual([]);
	});

	it("取り消しの process に違う本文が来たら書かない", async () => {
		const k = fakes();
		const { after, rec } = prepare(SAMPLE);
		k.file.text = `${after}x`;
		expect(await commitUndo({ dropRecord: () => Promise.resolve(), process: k.process }, rec, after)).toBe("changed");
		expect(k.file.text).toBe(`${after}x`);
	});

	it("historyLimit を 3 にして4回書くと、最も古い記録が消えて 3 件", async () => {
		const k = fakes();
		const store = new Store(k.host, norm);
		await store.saveSettings({ ...store.settings, historyLimit: 3 });
		for (const id of ["1", "2", "3", "4"]) await store.addRecord({ ...prepare(SAMPLE).rec, id });
		expect(store.history.map((r) => r.id)).toEqual(["4", "3", "2"]);
	});

	it("rename で履歴と下書きのパスを直す(フォルダの rename も)", async () => {
		const k = fakes();
		const store = new Store(k.host, norm);
		await store.addRecord(prepare(SAMPLE).rec);
		await store.setDrafts("仕様/a.md", { "A1#1": "x" });
		await store.renamePath("仕様", "仕様2");
		expect(store.history[0]?.path).toBe("仕様2/a.md");
		expect(store.data.drafts["仕様2/a.md"]).toEqual({ "A1#1": "x" });
		expect(movedPath("仕様X/a.md", "仕様", "仕様2")).toBe("仕様X/a.md");
	});

	it("時刻は現地のオフセットつき ISO 8601", () => {
		expect(isoLocal(new Date())).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}[+-]\d\d:\d\d$/);
	});
});

describe("data.json と対象(§9.2・D-15)", () => {
	it("欠けた項目は既定値、壊れた物と違う schemaVersion は problem", () => {
		expect(normalizeData(null, norm)).toMatchObject({ problem: false, data: { settings: DEFAULTS } });
		expect(normalizeData({ schemaVersion: 1, settings: { historyLimit: 5 } }, norm).data.settings.historyLimit).toBe(5);
		expect(normalizeData({ schemaVersion: 2 }, norm).problem).toBe(true);
		expect(normalizeData("x", norm).problem).toBe(true);
		expect(normalizeData({ schemaVersion: 1, history: [{ id: 1 }] }, norm).problem).toBe(true);
	});

	it("壊れた data.json のときは一切保存しない", async () => {
		const k = fakes();
		const store = new Store({ ...k.host, loadData: () => Promise.resolve({ schemaVersion: 9 }) }, norm);
		await store.load();
		expect(store.broken).toBe(true);
		await expect(store.addRecord(prepare(SAMPLE).rec)).rejects.toThrow();
		expect(k.log).not.toContain("saveData");
	});

	it("specFolders の下の md で、excludePaths の Foo は Foo/ の下だけ", () => {
		const s = { ...DEFAULTS, specFolders: ["仕様"], excludePaths: ["仕様/Foo"] };
		expect(isTarget("仕様/a.md", s)).toBe(true);
		expect(isTarget("a.md", s)).toBe(false);
		expect(isTarget("仕様/a.canvas", s)).toBe(false);
		expect(isTarget("仕様/Foo/a.md", s)).toBe(false);
		expect(isTarget("仕様/FooBar/a.md", s)).toBe(true);
	});

	it("既定は未設定(specFolders が空)。どのノートも対象にしない。保存してある値はそのまま", () => {
		expect(DEFAULTS.specFolders).toEqual([]);
		expect(isTarget("a.md", DEFAULTS)).toBe(false);
		expect(isTarget("仕様/a.md", DEFAULTS)).toBe(false);
		expect(normalizeData({ schemaVersion: 1, settings: { specFolders: ["仕様"] } }, norm).data.settings.specFolders).toEqual(["仕様"]);
	});
});
