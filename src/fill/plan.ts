// 置き換えの計画と適用、確認画面に出す「変わる行の前と後」(§9.5「置き換え」・FR-8・FR-9)。純関数。
// 位置はすべて置き換え前の本文で決め、後ろの欄から順に置き換える。計画は構造の検査(verify.ts)を通った物だけ返す(INV-6)。
// 同じ名前の欄にも入れる(D-12)ときは、どれか1か所の種類で値が受け付けられなければ、どれも書かない。
import { parseSpec, type Parsed, type Slot } from "../parse";
import { KIND_LABEL } from "../parse/kinds";
import type { FillRecord } from "./history";
import { checkValue } from "./values";
import { verifyStructure } from "./verify";

export interface Input {
	key: string;
	value: string;
	/** 同じ名前の欄にも入れる */
	all: boolean;
}

export interface Problem {
	/** null は欄によらない理由(構造の検査など) */
	key: string | null;
	reason: string;
}

export type Plan = { ok: true; after: string; fills: FillRecord[] } | { ok: false; problems: Problem[] };

export interface FillOptions {
	tableLineBreak: string;
	mentionTexts: readonly string[];
}

/** 控えに fills を当てる。fills の位置に欄の文字列が無ければ null */
export function applyFills(before: string, fills: readonly FillRecord[]): string | null {
	let out = before;
	for (const f of [...fills].sort((a, b) => b.start - a.start)) {
		if (before.slice(f.start, f.end) !== f.slot) return null;
		out = out.slice(0, f.start) + f.text + out.slice(f.end);
	}
	return out;
}

/** 入力が入る欄(その欄と、all なら §8 の同じ中身の欄すべて) */
export function targetsOf(slots: readonly Slot[], input: Pick<Input, "key" | "all">): Slot[] {
	const own = slots.find((s) => s.key === input.key);
	if (!own) return [];
	return input.all ? slots.filter((s) => s.inner === own.inner) : [own];
}

export type InputCheck = "ok" | "empty" | { reason: string };

/** 1つの入力の検査。all なら同じ名前の欄すべての種類で確かめる */
export function checkInput(slots: readonly Slot[], input: Input, tableLineBreak: string): InputCheck {
	const targets = targetsOf(slots, input);
	if (!targets.length) return { reason: "欄が無い" };
	for (const t of targets) {
		const c = checkValue(t, input.value, tableLineBreak);
		if (c.status === "empty") return "empty";
		if (c.status === "bad") return { reason: targets.length > 1 ? `${t.line + 1} 行目の${KIND_LABEL[t.kind]}の欄: ${c.reason}` : c.reason };
	}
	return "ok";
}

export function planFill(before: string, parsed: Parsed, inputs: readonly Input[], opt: FillOptions): Plan {
	const problems: Problem[] = [];
	if (parsed.unclosedAt !== null) {
		return { ok: false, problems: [{ key: null, reason: `${parsed.unclosedAt + 1} 行目からのコードブロックが閉じていない` }] };
	}
	const byStart = new Map<number, FillRecord>();
	for (const input of inputs) {
		const r = checkInput(parsed.slots, input, opt.tableLineBreak);
		if (r === "empty") continue;
		if (r !== "ok") {
			problems.push({ key: input.key, reason: r.reason });
			continue;
		}
		for (const t of targetsOf(parsed.slots, input)) {
			const c = checkValue(t, input.value, opt.tableLineBreak);
			if (c.status !== "ok") continue;
			if (byStart.has(t.start)) {
				problems.push({ key: input.key, reason: `${t.line + 1} 行目の欄に、別の入力も入る(同じ名前の欄にも入れる)` });
				continue;
			}
			byStart.set(t.start, { key: t.key, start: t.start, end: t.end, slot: t.raw, text: c.text, line: t.line });
		}
	}
	if (problems.length) return { ok: false, problems };
	const fills = [...byStart.values()].sort((a, b) => a.start - b.start);
	if (!fills.length) return { ok: false, problems: [{ key: null, reason: "入力が無い" }] };
	const after = applyFills(before, fills);
	if (after === null) return { ok: false, problems: [{ key: null, reason: "欄の位置が本文と合わない" }] };
	const bad = verifyStructure(before, after, fills, opt.mentionTexts);
	if (bad.length) return { ok: false, problems: bad.map((reason) => ({ key: null, reason })) };
	return { ok: true, after, fills };
}

export interface Change {
	/** 「8.5  363 行目  表」など */
	head: string;
	from: string[];
	to: string[];
}

/** 控えと fills から、変わる行ごとの前と後を作る(確認画面・控えを見る)。undo なら前と後を入れ替える(取り消しの確認) */
export function describeFills(before: string, fills: readonly FillRecord[], mentionTexts: readonly string[], undo = false): Change[] {
	const slots = new Map(parseSpec(before, mentionTexts).slots.map((s) => [s.start, s]));
	const byLine = new Map<number, FillRecord[]>();
	for (const f of fills) byLine.set(f.line, [...(byLine.get(f.line) ?? []), f]);
	const rows = before.split("\n");
	return [...byLine].sort(([a], [b]) => a - b).map(([line, fs]): Change => {
		const lineText = (rows[line] ?? "").replace(/\r$/, "");
		const lineStart = rows.slice(0, line).reduce((n, r) => n + r.length + 1, 0);
		let to = lineText;
		for (const f of [...fs].sort((a, b) => b.start - a.start)) {
			const c = f.start - lineStart;
			to = to.slice(0, c) + f.text + to.slice(c + f.slot.length);
		}
		const toRows = to.split(/\r?\n/);
		const kinds = [...new Set(fs.map((f) => KIND_LABEL[slots.get(f.start)?.kind ?? "text"]))].join("・");
		const sub = slots.get(fs[0]?.start ?? -1)?.sub ?? "";
		const count = fs.length > 1 ? `(${fs.length} か所)` : "";
		const n = toRows.length;
		const grow = n > 1 ? (undo ? `(${n} 行 → 1 行)` : `(1 行 → ${n} 行)`) : "";
		const head = `${sub}  ${line + 1} 行目  ${kinds}${count}${grow}`;
		return undo ? { head, from: toRows, to: [lineText] } : { head, from: [lineText], to: toRows };
	});
}

/** 最初の max 行まで。残りは「(ほか N 行)」 */
export function preview(rows: readonly string[], max = 5): string[] {
	return rows.length <= max ? [...rows] : [...rows.slice(0, max), `(ほか ${rows.length - max} 行)`];
}
