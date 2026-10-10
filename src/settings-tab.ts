// 設定タブ(FR-21。minAppVersion 1.14.4 なので getSettingDefinitions の宣言型。D-20)。§9.2 の6項目・履歴の件数・「履歴をすべて消す」。
// 配列は1行に1つの文字で見せ、パスは normalizePath を通す。保存は store.ts だけ(INV-1)。保存したらフォームを読み直す。
import { Notice, normalizePath, PluginSettingTab, type App, type SettingDefinitionItem } from "obsidian";
import { confirmChanges } from "./confirm";
import type PlaceholderFormPlugin from "./main";
import type { Settings } from "./settings";

type ListKey = "specFolders" | "excludePaths" | "mentionTexts";
const LIST_KEYS = new Set<string>(["specFolders", "excludePaths", "mentionTexts"]);
const PATH_KEYS = new Set<string>(["specFolders", "excludePaths"]);

const lines = (v: unknown): string[] => String(v).split(/\r?\n/).map((x) => x.trim()).filter((x) => x !== "");

export class PlaceholderFormSettingTab extends PluginSettingTab {
	constructor(app: App, private readonly owner: PlaceholderFormPlugin) {
		super(app, owner);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{ type: "group", items: [
				{ name: "仕様書のフォルダ", desc: "1行に1つ。vault からのパス。この下の md で §8 がある物を対象にする。未設定(空)だとどのノートも対象にならない。例: Specs や 仕様書", control: { type: "textarea", key: "specFolders", rows: 3 } },
				{ name: "除くパス", desc: "1行に1つ。フォルダかファイル。Foo は Foo/ の下だけに効く", control: { type: "textarea", key: "excludePaths", rows: 3 } },
				{ name: "欄にしない言及", desc: "1行に1つ。インラインコードの中でこの中身の欄は欄にしない。BlockerBoard と同じ値にする", control: { type: "textarea", key: "mentionTexts", rows: 2 } },
				{ name: "表のセルの改行", desc: "表のセルに入れる値の改行をこの文字にする(例: <br> か  / )", control: { type: "text", key: "tableLineBreak" } },
				{ name: "履歴の上限", desc: "これを超えたら古い記録(控え)から消す", control: { type: "number", key: "historyLimit", min: 1,
					validate: (v: number) => (Number.isInteger(v) && v >= 1 ? undefined : "1 以上の整数を入れてください") } },
				{ name: "入力の下書きを保存する", desc: "入力欄から離れたときに data.json に保存し、次にその仕様書を開いたとき戻す", control: { type: "toggle", key: "saveDrafts" } },
			] },
			{ type: "group", heading: "履歴", items: [
				{ name: "履歴", render: (setting) => {
					const n = this.owner.store.history.length;
					setting.setDesc(`${n} 件(上限 ${this.owner.store.settings.historyLimit})`);
					setting.addButton((b) => b.setButtonText("履歴をすべて消す").setDisabled(n === 0).onClick(() => void this.clearAll()));
				} },
			] },
		];
	}

	private async clearAll(): Promise<void> {
		const n = this.owner.store.history.length;
		const yes = await confirmChanges(this.app, { title: "履歴をすべて消す", ok: "消す",
			lead: `${n} 件の記録と控えを消す。消すと、それらの書き込みは取り消せなくなる。` });
		if (!yes) return;
		try {
			await this.owner.store.clearHistory();
		} catch {
			new Notice("履歴を消せなかった(data.json に保存できない)");
		}
		this.update();
		await this.owner.reload();
	}

	getControlValue(key: string): unknown {
		const s = this.owner.store.settings;
		if (LIST_KEYS.has(key)) return s[key as ListKey].join("\n");
		return s[key as keyof Settings];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const next: Settings = { ...this.owner.store.settings };
		if (LIST_KEYS.has(key)) {
			const xs = lines(value);
			next[key as ListKey] = PATH_KEYS.has(key) ? xs.map(normalizePath) : xs;
		} else if (key === "tableLineBreak") {
			next.tableLineBreak = String(value);
		} else if (key === "historyLimit") {
			const n = Number(value);
			if (!Number.isInteger(n) || n < 1) return;
			next.historyLimit = n;
		} else if (key === "saveDrafts") {
			next.saveDrafts = value === true;
		}
		try {
			await this.owner.store.saveSettings(next);
		} catch {
			this.owner.store.data.settings = next;              // この起動の間だけ効かせる(data.json は書き換えない。§9.2)
			new Notice("設定を data.json に保存できなかった。この起動の間だけ効く");
		}
		await this.owner.reload();
	}
}
