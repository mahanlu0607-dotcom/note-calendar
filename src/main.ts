import { App, Plugin, TFile, WorkspaceLeaf, Modal, Setting, Notice, Menu } from "obsidian";
import { CalendarView, CAL_VIEW_TYPE } from "./calendar-view";
import { DateStore } from "./date-store";
import { GraphColorSync } from "./graph-sync";
import { NoteCalendarSettingTab, NoteCalendarSettings, DEFAULT_SETTINGS } from "./settings";
import { NoteEntry, FolderColor, dateKey } from "./utils";

export default class NoteCalendarPlugin extends Plugin {
	settings: NoteCalendarSettings;
	store: DateStore;
	graphSync: GraphColorSync;
	private settingsTab: NoteCalendarSettingTab;
	private views: Set<CalendarView> = new Set();

	async onload() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		this.store = new DateStore(this.app, this);
		this.store.load(this.settings.manualMap || {});
		this.graphSync = new GraphColorSync(this.app);
		await this.graphSync.load();

		this.rescan();

		this.registerView(CAL_VIEW_TYPE, (leaf) => new CalendarView(leaf, this));

		// 左侧 ribbon 图标（始终存在）
		this.addRibbonIcon("calendar-with-checkmark", "打开笔记日历（右键选位置）", (ev) => {
			if (ev && (ev as any).button !== undefined && (ev as any).button !== 0) return;
			this.openView("right");
		});

		// 右侧 ribbon 图标：hack 方案（Obsidian 没有官方 API），挂 MutationObserver 持续注入
		this.injectRightRibbonIcon();

		this.addCommand({
			id: "open-note-calendar-right",
			name: "打开笔记日历（右侧边栏）",
			callback: () => this.openView("right"),
		});
		this.addCommand({
			id: "open-note-calendar-left",
			name: "打开笔记日历（左侧边栏）",
			callback: () => this.openView("left"),
		});
		this.addCommand({
			id: "open-note-calendar-tab",
			name: "打开笔记日历（新标签）",
			callback: () => this.openView("tab"),
		});
		this.addCommand({
			id: "toggle-note-calendar-side",
			name: "切换笔记日历边栏（开/关 + 切左右）",
			callback: () => this.toggleCalendarPane(),
		});

		this.settingsTab = new NoteCalendarSettingTab(this.app, this);
		this.addSettingTab(this.settingsTab);

		this.registerEvent(this.app.vault.on("create", () => this.scheduleRescan()));
		this.registerEvent(this.app.vault.on("delete", () => this.scheduleRescan()));
		this.registerEvent(this.app.vault.on("rename", () => this.scheduleRescan()));
		this.registerEvent(this.app.metadataCache.on("changed", () => this.scheduleRescan()));
		this.registerEvent(this.app.vault.on("modify", (file) => {
			if (file.path === ".obsidian/graph.json") {
				this.scheduleColorReload();
			}
		}));

		// 文件右键菜单：修改日历日期
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (file instanceof TFile && file.extension === "md") {
					menu.addItem((item) =>
						item
							.setTitle("修改日历日期…")
							.setIcon("calendar")
							.onClick(() => this.promptSetDateForPath(file.path))
					);
				}
			})
		);
	}

	onunload() {
		this.views.clear();
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// ============ 数据 ============
	rescan() {
		this.store.rescan();
		this.refreshAllViews();
	}

	private rescanTimer: number | null = null;
	private scheduleRescan() {
		if (this.rescanTimer) return;
		this.rescanTimer = window.setTimeout(() => {
			this.rescanTimer = null;
			this.store.rescan();
			this.refreshAllViews();
		}, 500);
	}

	private colorTimer: number | null = null;
	private scheduleColorReload() {
		if (this.colorTimer) return;
		this.colorTimer = window.setTimeout(async () => {
			this.colorTimer = null;
			await this.graphSync.load();
			this.refreshAllViews();
			if (this.settingsTab) this.settingsTab.display();
		}, 300);
	}

	entriesForDate(dateKeyStr: string): NoteEntry[] {
		return this.store.getByDate(dateKeyStr);
	}

	monthHasNotes(y: number, m: number): boolean {
		const dim = new Date(y, m, 0).getDate();
		for (let d = 1; d <= dim; d++) {
			if (this.store.getByDate(dateKey(y, m, d)).length > 0) return true;
		}
		return false;
	}

	// ============ 颜色 ============
	colorForFolder(folder: string): string {
		const g = this.graphSync.getColor(folder);
		if (g) return g;
		return this.settings.fallbackHex;
	}

	getFolderColors(): FolderColor[] {
		return this.graphSync.getAllGroups();
	}

	getAllFolders(): string[] {
		const set = new Set<string>();
		for (const e of this.store.getEntries().values()) {
			set.add(e.folder);
		}
		return Array.from(set).sort();
	}

	async setFolderColor(folder: string, hex: string) {
		await this.graphSync.setColor(folder, hex);
		this.refreshAllViews();
	}

	async removeFolderColor(folder: string) {
		await this.graphSync.removeColor(folder);
		this.refreshAllViews();
	}

	// ============ 视图 ============
	async openView(side: "left" | "right" | "tab") {
		const existing = this.app.workspace.getLeavesOfType(CAL_VIEW_TYPE);
		let leaf: WorkspaceLeaf;
		if (existing.length > 0) {
			leaf = existing[0];
		} else if (side === "tab") {
			leaf = this.app.workspace.getLeaf("split");
		} else {
			leaf = this.app.workspace.getLeaf(side as any);
		}
		if (existing.length === 0) {
			await leaf.setViewState({ type: CAL_VIEW_TYPE, active: true });
		}
		this.app.workspace.revealLeaf(leaf);
	}

	refreshAllViews() {
		for (const v of this.views) {
			v.refresh();
		}
	}

	registerViewRef(view: CalendarView) {
		this.views.add(view);
	}

	unregisterViewRef(view: CalendarView) {
		this.views.delete(view);
	}

	// ============ 日期操作 ============
	/** 拖动卡片到目标日期后调用：写入 manualMap、保存、重扫 */
	async moveNoteToDate(path: string, newDateKey: string) {
		this.store.setManualDate(path, newDateKey);
		this.settings.manualMap = this.store.toData();
		await this.saveSettings();
		this.rescan();
	}

	// ============ 右上角图标（hack 方案，Obsidian 无官方 API）============
	private rightIconObserver: MutationObserver | null = null;

	private injectRightRibbonIcon() {
		const CAL_ID = "note-calendar-ribbon";
		// 候选容器：优先顶部标签栏（你截图那排图标所在区域），其次右侧面板 header
		const candidates = [
			".workspace-tab-header-container-inner",
			".workspace-tab-header-container",
			".workspace-sidedock.mod-right .workspace-sidedock-header-inner",
			".workspace-sidedock.mod-right .workspace-sidedock-header",
		];
		const doInject = () => {
			for (const sel of candidates) {
				const container = document.querySelector(sel);
				if (!container) continue;
				if (container.querySelector(`.${CAL_ID}`)) return;
				const btn = document.createElement("div");
				btn.className = `clickable-icon ${CAL_ID}`;
				btn.setAttribute("aria-label", "笔记日历（点击切换）");
				btn.setAttribute("title", "笔记日历");
				btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><rect x="5" y="12" width="3" height="3" fill="currentColor"></rect></svg>`;
				btn.addEventListener("click", () => this.toggleCalendarPane());
				container.insertBefore(btn, container.firstChild);
				console.log("[note-calendar] 右上角图标已注入到", sel);
				return;
			}
			console.log("[note-calendar] 未找到可注入的容器（Obsidian 版本可能不同）");
		};
		doInject();
		// 监听 DOM 变化（Obsidian 会动态重建）
		this.rightIconObserver = new MutationObserver(() => doInject());
		this.rightIconObserver.observe(document.body, { childList: true, subtree: true });
	}

	/** 切换日历边栏：开着就关，关着就开（按上次位置） */
	private toggleCalendarPane() {
		const existing = this.app.workspace.getLeavesOfType(CAL_VIEW_TYPE);
		if (existing.length > 0) {
			// 已开，关掉
			existing[0].detach();
		} else {
			// 没开，开到右侧
			this.openView("right");
		}
	}

	promptSetDate(e: NoteEntry) {
		this.promptSetDateForPath(e.path);
	}

	promptSetDateForPath(path: string) {
		const current = this.store.getDateForFile(this.app.vault.getAbstractFileByPath(path) as TFile);
		const modal = new DateEditModal(this.app, current, async (newDate) => {
			if (newDate) {
				this.store.setManualDate(path, newDate);
				this.settings.manualMap = this.store.toData();
				await this.saveSettings();
				this.rescan();
			}
		});
		modal.open();
	}
}

/** 修改日期的弹窗 */
class DateEditModal extends Modal {
	constructor(
		app: App,
		private current: string,
		private onConfirm: (date: string | null) => void | Promise<void>
	) {
		super(app);
	}
	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { text: "修改日历日期" });
		contentEl.createEl("p", { text: "当前日期：" + this.current }).style.color = "var(--text-muted)";
		const picker = contentEl.createEl("input", { type: "date" }) as HTMLInputElement;
		picker.value = this.current;
		picker.style.width = "100%";
		picker.style.padding = "6px";
		picker.style.margin = "8px 0 16px";

		const btnRow = contentEl.createDiv({ cls: "nc-modal-buttons" });
		const okBtn = btnRow.createEl("button", { text: "保存", cls: "mod-cta" });
		okBtn.onclick = async () => {
			const v = picker.value;
			await this.onConfirm(v);
			this.close();
		};
		const clearBtn = btnRow.createEl("button", { text: "清除（回到文件创建日期）" });
		clearBtn.onclick = async () => {
			await this.onConfirm(null);
			this.close();
		};
		const cancelBtn = btnRow.createEl("button", { text: "取消" });
		cancelBtn.onclick = () => {
			this.close();
		};
	}
	onClose() {
		this.contentEl.empty();
	}
}