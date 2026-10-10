// 仕様書への書き込み(控えの保存 → vault.process)と取り消し。vault.process を呼ぶのはこのファイルだけ(INV-1)。
// process に渡す関数は、受け取った本文が直前に read で読んだ本文(取り消しでは書き込み直後の本文)と違えば例外を投げる(INV-5)。
// 控えの保存が終わってから process を呼び、保存が失敗したら書かない(INV-4)。手順は偽の関数で試せる形にしてある。
import type { App, TFile } from "obsidian";
import { applyFills } from "./fill/plan";
import type { HistoryRecord } from "./fill/history";

export class ChangedError extends Error {
	constructor() {
		super("仕様書が変わった");
	}
}

export type Process = (fn: (data: string) => string) => Promise<string>;

export interface WriteDeps {
	/** 記録(控え)を履歴に足して data.json に保存する。失敗なら投げる */
	saveRecord(rec: HistoryRecord): Promise<void>;
	dropRecord(id: string): Promise<void>;
	process: Process;
}

export type WriteResult = "ok" | "backup-failed" | "changed" | "unknown";

/** 本文が expected のときだけ next にする関数 */
const guard = (expected: string, next: string) => (data: string): string => {
	if (data !== expected) throw new ChangedError();
	return next;
};

/** 書き込み(FR-10・FR-11)。before は直前に read で読んだ本文 */
export async function commitFill(deps: WriteDeps, before: string, after: string, rec: HistoryRecord): Promise<WriteResult> {
	try {
		await deps.saveRecord(rec);
	} catch {
		return "backup-failed";
	}
	try {
		await deps.process(guard(before, after));
		return "ok";
	} catch (e) {
		if (!(e instanceof ChangedError)) return "unknown";       // 記録は残す(§10)
		await deps.dropRecord(rec.id).catch(() => undefined);
		return "changed";
	}
}

/** 取り消し(FR-14)。current は直前に read で読んだ本文で、書き込み直後と同じであること */
export async function commitUndo(deps: Pick<WriteDeps, "dropRecord" | "process">, rec: HistoryRecord, current: string):
	Promise<Exclude<WriteResult, "backup-failed">> {
	if (applyFills(rec.before, rec.fills) !== current) return "changed";
	try {
		await deps.process(guard(current, rec.before));
	} catch (e) {
		return e instanceof ChangedError ? "changed" : "unknown";
	}
	await deps.dropRecord(rec.id).catch(() => undefined);      // 消せなくても状態は「書かれていない」になるだけ
	return "ok";
}

export function vaultProcess(app: App, file: TFile): Process {
	return (fn) => app.vault.process(file, fn);
}
