// 本文を行に分け、コードブロックの内外・見出し・H2 の節番号・行の開始位置と改行を1回の読みで決める(§9.5「行と節」)。
// 規則は BlockerBoard §9.5 と同じ(コードは共有せず、ここに書く)。純関数。obsidian を import しない。
// 判定は行末の \r を取った文字列で行い、書き込みに使う位置は元の本文の位置で持つ。
export interface Line {
	/** 行末の \r を取った物 */
	text: string;
	/** 本文での行の開始位置(UTF-16) */
	start: number;
	/** この行の改行。最後の行で改行が無ければ、前の行の改行 */
	eol: "\r\n" | "\n";
	/** フェンスの行 */
	fence: boolean;
	/** フェンスの行か、コードブロックの中 */
	code: boolean;
	/** 見出しの深さ。見出しでなければ 0 */
	level: number;
	title: string;
	/** 属する H2 の節番号。最初の H2 より前と、数字で始まらない H2 の下は null */
	section: string | null;
}

export interface LineScan {
	lines: Line[];
	/** 閉じていないコードブロックの開きの行(0 始まり)。閉じていれば null */
	unclosedAt: number | null;
}

export const FENCE = /^\s*(```|~~~)/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const SECTION_NO = /^\d+/;

export function scanLines(text: string): LineScan {
	const lines: Line[] = [];
	let openAt: number | null = null;
	let section: string | null = null;
	let start = 0;
	const raws = text.split("\n");
	raws.forEach((raw, i) => {
		const cr = raw.endsWith("\r");
		const t = cr ? raw.slice(0, -1) : raw;
		const last = i === raws.length - 1;
		const eol: Line["eol"] = cr || (last && lines[i - 1]?.eol === "\r\n") ? "\r\n" : "\n";
		const base = { text: t, start, eol, level: 0, title: "", section };
		start += raw.length + 1;
		if (FENCE.test(t)) {
			openAt = openAt === null ? i : null;
			lines.push({ ...base, fence: true, code: true });
			return;
		}
		const h = openAt === null ? HEADING.exec(t) : null;
		if (!h) {
			lines.push({ ...base, fence: false, code: openAt !== null });
			return;
		}
		const level = (h[1] ?? "").length;
		const title = h[2] ?? "";
		if (level === 2) section = SECTION_NO.exec(title)?.[0] ?? null;
		lines.push({ ...base, fence: false, code: false, level, title, section });
	});
	return { lines, unclosedAt: openAt };
}

/** 表の行: コードブロックの外で、先頭の空白を除くと縦棒で始まる行(§9.5「種類」) */
export const isTableLine = (l: Line): boolean => !l.code && /^\s*\|/.test(l.text);
