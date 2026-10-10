// 仕様書1本の解析(行 → 欄 → 種類・キー・文脈)。結果はフォーム・確定・構造の検査が共通に使う(§9.5)。純関数。
// キー = 中身 + `#` + §8 の中で同じ中身の欄の何番目か(1 始まり)。中身は正規化せず文字列のまま比べる(§10)。
// 解析が例外で落ちたら parseOne が { error } で返す(FR-19)。
import { contextOf, kindOf, type Kind } from "./kinds";
import { scanLines } from "./lines";
import { scanSlots } from "./slots";

export type { Kind } from "./kinds";

export interface Slot {
	key: string;
	inner: string;
	raw: string;
	/** 同じ中身の欄の何番目か(1 始まり) */
	nth: number;
	sub: string;
	/** 行番号(0 始まり) */
	line: number;
	/** 本文での位置(UTF-16)。end は二重の閉じ波括弧の直後 */
	start: number;
	end: number;
	kind: Kind;
	inInline: boolean;
	/** 行が欄だけ(前後の空白を除く) */
	alone: boolean;
	/** 見出しの行 */
	heading: boolean;
	/** 欄のある行の改行 */
	eol: "\r\n" | "\n";
	context: string;
	lineText: string;
}

export interface Parsed {
	has8: boolean;
	/** §8 の中の欄(出現順) */
	slots: Slot[];
	/** §8 の外の欄(中身と行番号だけ) */
	outside: { inner: string; line: number }[];
	unclosedAt: number | null;
	headings: string[];
	/** フェンスの行の数 */
	fences: number;
}

export function parseSpec(text: string, mentionTexts: readonly string[]): Parsed {
	const { lines, unclosedAt } = scanLines(text);
	const scan = scanSlots(lines, mentionTexts);
	const seen = new Map<string, number>();
	const slots = scan.inside.map((h): Slot => {
		const l = lines[h.line];
		if (!l) throw new Error(`行 ${h.line + 1} が無い`);
		const nth = (seen.get(h.inner) ?? 0) + 1;
		seen.set(h.inner, nth);
		const kind = kindOf(l, h.inInline);
		const start = l.start + h.col;
		return {
			key: `${h.inner}#${nth}`, inner: h.inner, raw: h.raw, nth, sub: h.sub, line: h.line,
			start, end: start + h.raw.length, kind, inInline: h.inInline,
			alone: l.text.trim() === h.raw, heading: l.level > 0, eol: l.eol,
			context: contextOf(lines, h.line, h.col, kind), lineText: l.text,
		};
	});
	return {
		has8: scan.has8, slots, outside: scan.outside.map((h) => ({ inner: h.inner, line: h.line })),
		unclosedAt, headings: scan.headings, fences: lines.filter((l) => l.fence).length,
	};
}

export function parseOne(text: string, mentionTexts: readonly string[]): Parsed | { error: string } {
	try {
		return parseSpec(text, mentionTexts);
	} catch (e) {
		return { error: e instanceof Error ? e.message : String(e) };
	}
}

/** 並びの一致(FR-8・FR-11): (キー, 種類, 小節, 行の文字列) の配列が同じ */
export function sameOrder(a: readonly Slot[], b: readonly Slot[]): boolean {
	return a.length === b.length && a.every((s, i) => {
		const t = b[i];
		return t !== undefined && s.key === t.key && s.kind === t.kind && s.sub === t.sub && s.lineText === t.lineText;
	});
}

/** 小節ごとにまとめる(現れた順) */
export function groupBySub(slots: readonly Slot[]): { sub: string; slots: Slot[] }[] {
	const by = new Map<string, Slot[]>();
	for (const s of slots) by.set(s.sub, [...(by.get(s.sub) ?? []), s]);
	return [...by].map(([sub, xs]) => ({ sub, slots: xs }));
}
