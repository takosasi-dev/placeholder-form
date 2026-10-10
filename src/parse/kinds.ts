// 欄の種類(コード / 表 / インラインコード / 文)・文脈を決める(§9.5「種類」「キーと文脈」・FR-3)。
// 純関数。種類は上から順に最初に当たった物。表のセルの区切りは、前に `\` の無い縦棒。
import { isTableLine, type Line } from "./lines";

export type Kind = "code" | "table" | "inline" | "text";

export const KIND_LABEL: Record<Kind, string> = { code: "コード", table: "表", inline: "インラインコード", text: "文" };
export const KIND_ORDER: Kind[] = ["table", "code", "inline", "text"];

export function kindOf(l: Line, inInline: boolean): Kind {
	if (l.code) return "code";
	if (isTableLine(l)) return "table";
	if (inInline) return "inline";
	return "text";
}

/** 前に `\` の無い縦棒で区切った断片。[0] は先頭の縦棒より前 */
function cells(t: string): string[] {
	const out: string[] = [];
	let from = 0;
	for (let i = 0; i < t.length; i++) {
		if (t[i] === "|" && t[i - 1] !== "\\") {
			out.push(t.slice(from, i));
			from = i + 1;
		}
	}
	out.push(t.slice(from));
	return out;
}

const CONTEXT_MAX = 80;
const clip = (s: string): string => [...s.trim()].slice(0, CONTEXT_MAX).join("");

/**
 * 表: 「その行の1列目 / 同じ列の表の1行目のセル」。コード: 開きのフェンスより前で、コードブロックの外の最も近い空でない行。
 * インラインコードと文: その行。表示は先頭 80 字。
 */
export function contextOf(lines: readonly Line[], i: number, col: number, kind: Kind): string {
	const l = lines[i];
	if (!l) return "";
	if (kind === "table") {
		let h = i;
		while (h > 0 && lines[h - 1] && isTableLine(lines[h - 1] as Line)) h--;
		const n = cells(l.text.slice(0, col)).length - 1;
		const first = (cells(l.text)[1] ?? "").trim();
		const head = (cells(lines[h]?.text ?? "")[n] ?? "").trim();
		return clip(`${first} / ${head}`);
	}
	if (kind === "code") {
		let j = i - 1;
		while (j >= 0 && (lines[j]?.code || lines[j]?.text.trim() === "")) j--;
		return clip(lines[j]?.text ?? "");
	}
	return clip(l.text);
}
