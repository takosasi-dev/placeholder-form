// 値の検査と整形(AC-6)・置き換えと構造の検査(AC-7・AC-8)・確認画面の前と後(§9.6)。合成の検体だけを使う。
import { describe, expect, it } from "vitest";
import { applyFills, describeFills, planFill, preview, type Input } from "../src/fill/plan";
import { checkValue, escapePipes } from "../src/fill/values";
import { verifyStructure } from "../src/fill/verify";
import { parseSpec, type Slot } from "../src/parse";
import { DEFAULTS } from "../src/settings";
import { F, SAMPLE } from "./sample";

const mt = DEFAULTS.mentionTexts;
const opt = { tableLineBreak: "<br>", mentionTexts: mt };
const parsed = parseSpec(SAMPLE, mt);
const slot = (key: string): Slot => {
	const s = parsed.slots.find((x) => x.key === key);
	if (!s) throw new Error(key);
	return s;
};
const ok = (s: Slot, v: string) => {
	const c = checkValue(s, v, "<br>");
	return c.status === "ok" ? c.text : c.status;
};

describe("値の規則(§9.5)", () => {
	it("表: 改行は tableLineBreak、縦棒は \\| に、既に \\| の物はそのまま", () => {
		expect(ok(slot("A1#1"), "1行目\n2行目")).toBe("1行目<br>2行目");
		expect(ok(slot("A1#1"), "A | B \\| C")).toBe("A \\| B \\| C");
		expect(escapePipes("a||b")).toBe("a\\|\\|b");
	});

	it("表のインラインコードの中・インラインコードの欄は改行と ` を拒む", () => {
		for (const k of ["IN_TABLE#1", "VERSION#1", "H4_SLOT#1"]) {
			expect(checkValue(slot(k), "a\nb", "<br>").status).toBe("bad");
			expect(checkValue(slot(k), "a`b", "<br>").status).toBe("bad");
		}
		expect(ok(slot("IN_TABLE#1"), "A | B")).toBe("A \\| B");
	});

	it("コードの欄はフェンスの行を拒み、複数行は受け付ける", () => {
		expect(checkValue(slot("CODE_A#1"), "a\n  ```\nb", "<br>").status).toBe("bad");
		expect(checkValue(slot("CODE_A#1"), "~~~", "<br>").status).toBe("bad");
		expect(ok(slot("CODE_A#1"), "a\nb")).toBe("a\nb");
	});

	it("文: 途中の欄は改行を拒む。行が欄だけの欄は見出しとフェンスの行を拒む", () => {
		expect(checkValue(slot("MID#1"), "a\nb", "<br>").status).toBe("bad");
		expect(ok(slot("ALONE#1"), "| a | b |\n| c | d |")).toBe("| a | b |\n| c | d |");
		expect(checkValue(slot("ALONE#1"), "x\n## 見出し", "<br>").status).toBe("bad");
		expect(checkValue(slot("ALONE#1"), "x\n```", "<br>").status).toBe("bad");
	});

	it("二重の開き波括弧は拒む・空白だけは入力なし・末尾の改行は取る", () => {
		expect(checkValue(slot("ALONE#1"), "a {{b", "<br>").status).toBe("bad");
		expect(checkValue(slot("ALONE#1"), "  \n ", "<br>").status).toBe("empty");
		expect(ok(slot("MID#1"), "値\r\n\n")).toBe("値");
	});

	it("CRLF の行の欄では複数行が \\r\\n で区切られる", () => {
		const crlf = parseSpec(`## 8. x\r\n${F}\r\n{{A}}\r\n${F}\r\n`, mt);
		const a = crlf.slots[0] as Slot;
		expect(ok(a, "1\n2\n3")).toBe("1\r\n2\r\n3");
	});
});

const fillAll = (text: string): Input[] => parseSpec(text, mt).slots.map((s, i) => ({
	key: s.key, all: false,
	value: s.kind === "code" || (s.kind === "text" && s.alone && !s.heading) ? `値${i}\n二行目 | x` : `値${i} | y`,
}));

describe("置き換えと構造の検査", () => {
	it("全部の欄に値を入れても、値を除くと元と同じ(検査 5)。1行の5つも正しい位置に入る", () => {
		const plan = planFill(SAMPLE, parsed, fillAll(SAMPLE), opt);
		expect(plan.ok).toBe(true);
		if (!plan.ok) return;
		expect(plan.fills.length).toBe(17);
		const lines = plan.after.split("\n");
		expect(lines[14]).toBe("| 五つ | 値1 \\| y | 値2 \\| y | 値3 \\| y | 値4 \\| y | 値5 \\| y |");
		expect(verifyStructure(SAMPLE, plan.after, plan.fills, mt)).toEqual([]);
		expect(applyFills(SAMPLE, plan.fills)).toBe(plan.after);
		expect(plan.after).toContain("| R-1 | {{R1_DAYS}} 日 |");          // §8 の外は書き換えない
		expect(plan.after).toContain('"{{OUT9}}"');
		expect(parseSpec(plan.after, mt).slots.length).toBe(0);
	});

	it("CRLF の本文でも検査を通り、足した行は \\r\\n", () => {
		const crlf = SAMPLE.replace(/\n/g, "\r\n");
		const plan = planFill(crlf, parseSpec(crlf, mt), [{ key: "CODE_A#1", value: "1\n2\n3", all: false }], opt);
		expect(plan.ok && plan.after.includes("1\r\n2\r\n3\r\npath")).toBe(true);
	});

	it("次の欄の直前に末尾が { の値を入れると、構造の検査で止まり計画が返らない(AC-8)", () => {
		const text = ["## 8. x", "### 8.1 a", "| k | {{A}}{{B}} |", ""].join("\n");
		const plan = planFill(text, parseSpec(text, mt), [{ key: "A#1", value: "x{", all: false }], opt);
		expect(plan.ok).toBe(false);
		if (plan.ok) return;
		expect(plan.problems.map((p) => p.reason)).toContain("§8 の欄の並びが変わる(次の欄の形が変わるなど)");
	});

	it("見出しやフェンスを作る1行の値も構造の検査で止まる", () => {
		const text = ["## 8. x", "{{A}} です", "{{B}} です", ""].join("\n");
		const p = parseSpec(text, mt);
		const fence = planFill(text, p, [{ key: "A#1", value: F, all: false }], opt);
		expect(fence.ok ? [] : fence.problems.map((x) => x.reason)).toContain("フェンスの行の数が変わる");
		const head = planFill(text, p, [{ key: "B#1", value: "## 9.", all: false }], opt);
		expect(head.ok ? [] : head.problems.map((x) => x.reason)).toContain("見出しの並びが変わる");
	});

	it("同じ名前: 既定は押した1か所、ON なら全部。どれか1か所で拒まれたらどれも書かない", () => {
		const one = planFill(SAMPLE, parsed, [{ key: "DUP#2", value: "v", all: false }], opt);
		expect(one.ok && one.after.includes("{{DUP}} と v")).toBe(true);
		const all = planFill(SAMPLE, parsed, [{ key: "DUP#1", value: "v", all: true }], opt);
		expect(all.ok && all.after.includes("v と v")).toBe(true);
		const text = ["## 8. x", "{{X}}", "`{{X}}` です", ""].join("\n");
		const mixed = planFill(text, parseSpec(text, mt), [{ key: "X#1", value: "a\nb", all: true }], opt);
		expect(mixed.ok).toBe(false);
	});

	it("閉じないコードブロックの仕様書は書かない(INV-7)", () => {
		const text = ["## 8. x", "{{A}}", F, ""].join("\n");
		expect(planFill(text, parseSpec(text, mt), [{ key: "A#1", value: "v", all: false }], opt).ok).toBe(false);
	});

	it("入力なしだけなら計画しない", () => {
		expect(planFill(SAMPLE, parsed, [{ key: "A1#1", value: "  ", all: false }], opt).ok).toBe(false);
	});
});

describe("確認画面の前と後(§9.6)", () => {
	it("行ごとに小節・行番号・種類・前・後。後は5行まで", () => {
		const plan = planFill(SAMPLE, parsed, [
			{ key: "CODE_A#1", value: "1\n2\n3\n4\n5\n6\n7", all: false },
			{ key: "A1#1", value: "x", all: false },
			{ key: "B1#1", value: "y", all: false },
		], opt);
		if (!plan.ok) throw new Error("計画できない");
		const ch = describeFills(SAMPLE, plan.fills, mt);
		expect(ch.map((c) => c.head)).toEqual(["8.1  15 行目  表(2 か所)", "8.2  24 行目  コード(1 行 → 7 行)"]);
		expect(ch[0]?.to).toEqual(["| 五つ | x | y | {{C1}} | {{D1}} | {{E1}} |"]);
		expect(preview(ch[1]?.to ?? [])).toEqual(["1", "2", "3", "4", "5", "(ほか 2 行)"]);
		const undo = describeFills(SAMPLE, plan.fills, mt, true);
		expect(undo[1]?.head).toBe("8.2  24 行目  コード(7 行 → 1 行)");
		expect(undo[1]?.to).toEqual(["{{CODE_A}}"]);
	});
});
