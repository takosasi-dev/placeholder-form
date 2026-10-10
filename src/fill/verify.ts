// 構造の検査(§9.5・INV-2・INV-6・D-14)。置き換え後の本文を §9.5 の規則で読み直し、5つを全部確かめる。純関数。
// 返すのは通らなかった理由の一覧(空なら通った)。1つでもあれば書かない。
import { parseSpec } from "../parse";
import type { FillRecord } from "./history";

const same = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

/** 本文から [start, end) の範囲を順に除く */
function strip(text: string, ranges: readonly (readonly [number, number])[]): string {
	let out = "";
	let at = 0;
	for (const [s, e] of ranges) {
		out += text.slice(at, s);
		at = e;
	}
	return out + text.slice(at);
}

export function verifyStructure(before: string, after: string, fills: readonly FillRecord[], mentionTexts: readonly string[]): string[] {
	const reasons: string[] = [];
	const a = parseSpec(before, mentionTexts);
	const b = parseSpec(after, mentionTexts);
	const filled = new Set(fills.map((f) => f.start));
	// 1. §8 の欄の (中身, 小節) の並びが、埋めた欄を除いた物と同じ
	const pair = (s: { inner: string; sub: string }) => `${s.inner}\u0000${s.sub}`;
	if (!same(a.slots.filter((s) => !filled.has(s.start)).map(pair), b.slots.map(pair))) {
		reasons.push("§8 の欄の並びが変わる(次の欄の形が変わるなど)");
	}
	// 2. 見出しの (レベル, H2 の節番号, §8 の小節名) の並びが同じ
	if (!same(a.headings, b.headings)) reasons.push("見出しの並びが変わる");
	// 3. フェンスの行の数が同じ
	if (a.fences !== b.fences) reasons.push("フェンスの行の数が変わる");
	// 4. §8 の外の欄の数が同じ
	if (a.outside.length !== b.outside.length) reasons.push("§8 の外の欄の数が変わる");
	// 5. 置き換え後から入れた値の位置を順に除くと、置き換え前から欄を除いた物と同じ(INV-2)
	const sorted = [...fills].sort((x, y) => x.start - y.start);
	let shift = 0;
	const valueRanges = sorted.map((f) => {
		const s = f.start + shift;
		shift += f.text.length - (f.end - f.start);
		return [s, s + f.text.length] as const;
	});
	const valuesHere = sorted.every((f, i) => after.slice(valueRanges[i]?.[0], valueRanges[i]?.[1]) === f.text);
	const slotsHere = sorted.every((f) => before.slice(f.start, f.end) === f.slot);
	if (!valuesHere || !slotsHere || strip(after, valueRanges) !== strip(before, sorted.map((f) => [f.start, f.end] as const))) {
		reasons.push("欄の外の文字が変わる");
	}
	return reasons;
}
