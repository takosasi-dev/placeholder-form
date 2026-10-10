// 欄に入れる値の検査と整形(§9.5 の表・FR-6・FR-7)。純関数。
// 整形は3つだけ: 末尾の改行を取る / 行の区切りをその行の改行にそろえる / 表の中の改行と縦棒(INV-8)。
// 値の中身は見ない。見るのは形だけ(D-18)。
import { FENCE } from "../parse/lines";
import type { Slot } from "../parse";

export type Check = { status: "empty" } | { status: "bad"; reason: string } | { status: "ok"; text: string };

const HEADING_SHAPE = /^#{1,6}\s/;

/** 前に `\` の無い縦棒の前に `\` を足す */
export const escapePipes = (s: string): string => s.replace(/\\?\|/g, (m) => (m.length === 2 ? m : "\\|"));

export function checkValue(slot: Pick<Slot, "kind" | "inInline" | "alone" | "heading" | "eol">, value: string,
	tableLineBreak: string): Check {
	const v = value.replace(/[\r\n]+$/, "");
	if (v.trim() === "") return { status: "empty" };
	if (v.includes("{{")) return { status: "bad", reason: "二重の開き波括弧は入れられない(欄として数えられる)" };
	const rows = v.split(/\r\n|\r|\n/);
	const multi = rows.length > 1;
	const bad = (reason: string): Check => ({ status: "bad", reason });
	switch (slot.kind) {
		case "code":
			if (rows.some((r) => FENCE.test(r))) return bad("フェンスの行は入れられない(コードブロックが閉じる)");
			return { status: "ok", text: rows.join(slot.eol) };
		case "table":
			if (slot.inInline && multi) return bad("インラインコードの中の欄なので、改行は入れられない");
			if (slot.inInline && v.includes("`")) return bad("` は入れられない(インラインコードが閉じる)");
			return { status: "ok", text: escapePipes(rows.join(tableLineBreak)) };
		case "inline":
			if (multi) return bad("インラインコードの欄なので、1行だけ");
			if (v.includes("`")) return bad("` は入れられない(インラインコードが閉じる)");
			return { status: "ok", text: v };
		case "text":
			if (!slot.alone || slot.heading) {
				return multi ? bad("行の途中か見出しの行の欄なので、1行だけ") : { status: "ok", text: v };
			}
			if (rows.some((r) => FENCE.test(r))) return bad("フェンスの行は入れられない(コードブロックが始まる)");
			if (rows.some((r) => HEADING_SHAPE.test(r))) return bad("見出しの形の行は入れられない");
			return { status: "ok", text: rows.join(slot.eol) };
	}
}
