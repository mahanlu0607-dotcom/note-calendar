import { App, Plugin, TFile } from "obsidian";
import { NoteEntry, getFolder, getH1Title, dateKey, tsToKey } from "./utils";

/**
 * 文件 → 日历日期的存储层。
 * 默认用文件系统 ctime（创建时间）；data.json 中存一份覆盖映射（路径 → 日期），
 * 用于手动调整日期，以及云同步导致 ctime 漂移时兜底。
 */
export class DateStore {
	private manualMap: Record<string, string> = {};
	/** 扫描缓存：path -> NoteEntry */
	private entries: Map<string, NoteEntry> = new Map();
	/** 日期 -> NoteEntry[] */
	private byDate: Map<string, NoteEntry[]> = new Map();

	constructor(
		private app: App,
		private plugin: Plugin
	) {}

	load(data: Record<string, string>) {
		if (data) this.manualMap = data;
	}

	toData(): Record<string, string> {
		return this.manualMap;
	}

	getManualDate(path: string): string | undefined {
		return this.manualMap[path];
	}

	/** 设置/清除手动日期（清除时传 undefined），返回改动后是否保存了 */
	setManualDate(path: string, dateStr: string | undefined): boolean {
		if (dateStr === undefined) {
			delete this.manualMap[path];
		} else {
			this.manualMap[path] = dateStr;
		}
		return true;
	}

	/** 解析文件的日历日期：手动映射 > ctime */
	getDateForFile(file: TFile): string {
		const manual = this.manualMap[file.path];
		if (manual) return manual;
		try {
			const stat = this.app.vault.getAbstractFileByPath(file.path);
			if (stat instanceof TFile && stat.stat) {
				return tsToKey(stat.stat.ctime);
			}
		} catch (e) {
			// ignore
		}
		return todayFallback();
	}

	rescan() {
		this.entries.clear();
		this.byDate.clear();
		const files = this.app.vault.getMarkdownFiles();
		for (const file of files) {
			if (file.path.startsWith(".obsidian")) continue;
			const dateStr = this.getDateForFile(file);
			const title = getH1Title(this.app, file, this.app.metadataCache);
			const entry: NoteEntry = {
				path: file.path,
				name: file.basename,
				title,
				folder: getFolder(file.path),
				dateStr,
			};
			this.entries.set(file.path, entry);
			const arr = this.byDate.get(dateStr) || [];
			arr.push(entry);
			this.byDate.set(dateStr, arr);
		}
		// 每个日期内按文件创建时间排序
		for (const [k, arr] of this.byDate) {
			arr.sort((a, b) => a.path.localeCompare(b.path));
			void k;
		}
	}

	getEntries(): Map<string, NoteEntry> {
		return this.entries;
	}

	getByDate(dateStr: string): NoteEntry[] {
		return this.byDate.get(dateStr) || [];
	}

	getAllDates(): Map<string, NoteEntry[]> {
		return this.byDate;
	}

	entryByPath(path: string): NoteEntry | undefined {
		return this.entries.get(path);
	}
}

function todayFallback(): string {
	const t = new Date();
	return dateKey(t.getFullYear(), t.getMonth() + 1, t.getDate());
}
