// 履歴の記録の型・状態・上限・パスの付け替え(§9.7・FR-13・FR-14)。純関数。
// 書き込み直後の本文は持たず、控え(before)に fills を当てて作り直す。状態は今の本文との文字列の一致で決める(D-22)。
import { applyFills } from "./plan";

export interface FillRecord {
	key: string;
	/** 控えの本文での欄の開始位置 */
	start: number;
	/** 同じく、欄の二重の閉じ波括弧の直後の位置 */
	end: number;
	/** 欄の文字列そのまま */
	slot: string;
	/** 入れた文字列(整形の後) */
	text: string;
	/** 控えの本文での行番号(0 始まり) */
	line: number;
}

export interface HistoryRecord {
	id: string;
	/** ISO 8601。端末の現地時刻のオフセットつき */
	at: string;
	path: string;
	/** 控え: 書き換え前の本文全体 */
	before: string;
	fills: FillRecord[];
}

export type RecordState = "undoable" | "unwritten" | "changed" | "missing";

export const STATE_LABEL: Record<RecordState, string> = {
	undoable: "取り消せる", unwritten: "書かれていない", changed: "本文が変わった", missing: "ファイルが無い",
};

/** current は今の本文(ファイルが無ければ null) */
export function recordState(rec: HistoryRecord, current: string | null): RecordState {
	if (current === null) return "missing";
	if (current === applyFills(rec.before, rec.fills)) return "undoable";
	if (current === rec.before) return "unwritten";
	return "changed";
}

/** 新しい順に足し、limit を超えた古い記録を消す */
export function pushRecord(history: readonly HistoryRecord[], rec: HistoryRecord, limit: number): HistoryRecord[] {
	return [rec, ...history].slice(0, Math.max(1, limit));
}

const pad = (n: number, w = 2): string => String(Math.abs(n)).padStart(w, "0");

/** 端末の現地時刻のオフセットつき ISO 8601 */
export function isoLocal(d: Date): string {
	const off = -d.getTimezoneOffset();
	const sign = off >= 0 ? "+" : "-";
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
		+ `:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}${sign}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`;
}

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0;
const isStr = (x: unknown): x is string => typeof x === "string";

function isFill(x: unknown): x is FillRecord {
	if (typeof x !== "object" || x === null) return false;
	const r = x as Record<string, unknown>;
	return isStr(r.key) && isNum(r.start) && isNum(r.end) && isStr(r.slot) && isStr(r.text) && isNum(r.line);
}

/** data.json から読んだ記録の形を確かめる */
export function isRecord(x: unknown): x is HistoryRecord {
	if (typeof x !== "object" || x === null) return false;
	const r = x as Record<string, unknown>;
	return isStr(r.id) && isStr(r.at) && isStr(r.path) && isStr(r.before) && Array.isArray(r.fills) && r.fills.every(isFill);
}
