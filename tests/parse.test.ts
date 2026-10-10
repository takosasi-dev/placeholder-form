// 欄の読み方・種類・キー・文脈(§9.5・AC-2)。合成の検体で §8.2 の形を1つずつ確かめる。
import { describe, expect, it } from "vitest";
import { groupBySub, parseOne, parseSpec, sameOrder } from "../src/parse";
import { DEFAULTS } from "../src/settings";
import { F, SAMPLE } from "./sample";

const mt = DEFAULTS.mentionTexts;
const p = parseSpec(SAMPLE, mt);
const slot = (key: string) => {
	const s = p.slots.find((x) => x.key === key);
	if (!s) throw new Error(`欄が無い: ${key}`);
	return s;
};

describe("欄の読み方", () => {
	it("小節: `### 8.1` と `### 8-2.` と前書き", () => {
		expect(groupBySub(p.slots).map((g) => `${g.sub}:${g.slots.length}`)).toEqual(["§8 前書き:1", "8.1:8", "8.2:2", "8.3:6"]);
	});

	it("表の1行に欄5つ(位置もそれぞれ)", () => {
		const row = p.slots.filter((s) => s.line === 14);
		expect(row.map((s) => s.inner)).toEqual(["A1", "B1", "C1", "D1", "E1"]);
		for (const s of row) expect(SAMPLE.slice(s.start, s.end)).toBe(s.raw);
		expect(row.every((s) => s.kind === "table")).toBe(true);
	});

	it("表のセルのインラインコードの中の欄は表(インラインコードの中)", () => {
		expect(slot("IN_TABLE#1")).toMatchObject({ kind: "table", inInline: true });
	});

	it("インラインコードの中の三点は欄にしない。空白だけの欄は欄", () => {
		expect(p.slots.some((s) => s.inner === "...")).toBe(false);
		expect(slot(" #1")).toMatchObject({ kind: "table", inner: " " });
	});

	it("コードブロックの中: 欄だけの行と文の途中", () => {
		expect(slot("CODE_A#1")).toMatchObject({ kind: "code", alone: true, context: "Console に貼る:" });
		expect(slot("CODE_B#1")).toMatchObject({ kind: "code", alone: false });
	});

	it("リストの行のインラインコード・H4 の見出しの行・文", () => {
		expect(slot("VERSION#1")).toMatchObject({ kind: "inline", heading: false });
		expect(slot("H4_SLOT#1")).toMatchObject({ kind: "inline", heading: true, sub: "8.3" });
		expect(slot("ALONE#1")).toMatchObject({ kind: "text", alone: true, heading: false });
		expect(slot("MID#1")).toMatchObject({ kind: "text", alone: false });
	});

	it("同じ中身2つはキーが #1 と #2", () => {
		expect(p.slots.filter((s) => s.inner === "DUP").map((s) => s.key)).toEqual(["DUP#1", "DUP#2"]);
	});

	it("開きだけの行は欄にしない。§8 の外は位置だけ(§5 と §9)", () => {
		expect(p.slots.some((s) => s.inner.startsWith("OPEN"))).toBe(false);
		expect(p.outside).toEqual([{ inner: "R1_DAYS", line: 6 }, { inner: "OUT9", line: 37 }]);
		expect(p.slots.length).toBe(17);
		expect(p.unclosedAt).toBeNull();
		expect(p.fences).toBe(4);
	});

	it("文脈: 表は1列目と同じ列の1行目", () => {
		expect(slot("C1#1").context).toBe("五つ / C");
		expect(slot("R1_DAYS#1").context).toBe("日数 / A");
	});

	it("閉じないコードブロックは開きの行を返す(欄は出す)", () => {
		const q = parseSpec(["## 8. x", "### 8.1 a", "{{A}}", F, "{{B}}"].join("\n"), mt);
		expect(q.unclosedAt).toBe(3);
		expect(q.slots.map((s) => s.key)).toEqual(["A#1", "B#1"]);
	});

	it("CRLF の行は改行を \\r\\n で持ち、位置は元の本文の位置", () => {
		const text = "## 8. x\r\n```\r\n{{A}}\r\n```\r\n";
		const q = parseSpec(text, mt);
		const a = q.slots[0];
		expect(a?.eol).toBe("\r\n");
		expect(text.slice(a?.start, a?.end)).toBe("{{A}}");
	});

	it("§8 が無い・並びの比較・例外の受け止め", () => {
		expect(parseSpec("# x\n{{A}}", mt).has8).toBe(false);
		const again = parseSpec(SAMPLE, mt);
		expect(sameOrder(p.slots, again.slots)).toBe(true);
		const changed = parseSpec(SAMPLE.replace("{{B1}}", "b"), mt);
		expect(sameOrder(p.slots, changed.slots)).toBe(false);
		expect("error" in parseOne(SAMPLE, mt)).toBe(false);
	});
});
