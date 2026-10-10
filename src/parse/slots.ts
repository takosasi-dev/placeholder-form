// 欄の位置を行ごとに拾い、§8 の中は小節つきで、§8 の外は位置だけで集める(§9.5「欄」・FR-2)。
// 規則は BlockerBoard §9.5 と同じ: 1行の中の {{…}} の各一致が1欄(見出しの行も含む)。インラインコードの中で中身が言及の物は欄にしない。
// 純関数。小節は `### 8.N` と `### 8-N.` を同じ 8.N にし、最初の H3 より前は「§8 前書き」。
import type { Line } from "./lines";

export const PREAMBLE = "§8 前書き";

export interface Hit {
	line: number;
	/** 行の中での開始位置 */
	col: number;
	/** 欄の文字列そのまま(二重の波括弧を含む) */
	raw: string;
	inner: string;
	/** インラインコードの中 */
	inInline: boolean;
}

export interface SlotScan {
	has8: boolean;
	inside: (Hit & { sub: string })[];
	outside: Hit[];
	/** 見出しごとの「レベル・H2 の節番号・§8 の小節名」(構造の検査 2) */
	headings: string[];
}

const BLANK = /\{\{(.*?)\}\}/g;
const INLINE_CODE = /`[^`]*`/g;
const SLOT_H3 = /^8\s*[.-]\s*(\d+)/;

export function hitsIn(text: string, line: number, mentionTexts: readonly string[]): Hit[] {
	if (!text.includes("{{")) return [];
	const spans = [...text.matchAll(INLINE_CODE)].map((m) => [m.index, m.index + m[0].length] as const);
	const out: Hit[] = [];
	for (const m of text.matchAll(BLANK)) {
		const s = m.index;
		const e = s + m[0].length;
		const inner = m[1] ?? "";
		const inInline = spans.some(([a, b]) => s >= a && e <= b);
		if (inInline && mentionTexts.includes(inner.trim())) continue;
		out.push({ line, col: s, raw: m[0], inner, inInline });
	}
	return out;
}

export function scanSlots(lines: readonly Line[], mentionTexts: readonly string[]): SlotScan {
	const out: SlotScan = { has8: false, inside: [], outside: [], headings: [] };
	let sub = PREAMBLE;
	lines.forEach((l, i) => {
		const in8 = l.section === "8";
		if (in8 && l.level === 2) {
			out.has8 = true;
			sub = PREAMBLE;
		} else if (in8 && l.level === 3) {
			const m = SLOT_H3.exec(l.title);
			sub = m ? `8.${Number(m[1])}` : l.title;
		}
		if (l.level > 0) out.headings.push(`${l.level}\t${l.section ?? ""}\t${in8 ? sub : ""}`);
		for (const h of hitsIn(l.text, i, mentionTexts)) {
			if (in8) out.inside.push({ ...h, sub });
			else out.outside.push(h);
		}
	});
	return out;
}
