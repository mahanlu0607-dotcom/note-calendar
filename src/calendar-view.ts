import { ItemView, WorkspaceLeaf, Menu, TFile, Notice, Platform } from "obsidian";
import NoteCalendarPlugin from "./main";
import { NoteEntry, dateKey, parseDateKey, todayKey, tintForCard } from "./utils";
import { lunarText } from "./lunar";

export const CAL_VIEW_TYPE = "note-calendar-view";
export const DRAG_MIME = "application/x-note-calendar";

const MONTH_NAMES = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"];
const WEEK_HEAD = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const WEEK_HEAD_SHORT = ["一", "二", "三", "四", "五", "六", "日"];
const LONG_PRESS_MS = 500;

export class CalendarView extends ItemView {
	private curKey: string = todayKey();
	private viewMode: string = "m";
	private yearFilter: string = "all";
	private sliderTimer: number | null = null;
	private get isMobile(): boolean {
		return Platform.isMobile || this.plugin.settings.simulateMobile;
	}

	constructor(leaf: WorkspaceLeaf, private plugin: NoteCalendarPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return CAL_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "笔记日历";
	}

	getIcon(): string {
		return "calendar-with-checkmark";
	}

	async onOpen() {
		this.plugin.registerViewRef(this);
		this.viewMode = this.plugin.settings.defaultView;
		this.render();
	}

	async onClose() {
		this.plugin.unregisterViewRef(this);
	}

	refresh() {
		this.render();
	}

	private render() {
		const c = this.contentEl;
		c.empty();
		c.addClass("note-calendar-view");
		if (this.isMobile) c.addClass("nc-mobile");

		const outer = c.createDiv({ cls: "nc-frame" });

		// 顶栏
		const header = outer.createDiv({ cls: "nc-header" });
		const left = header.createDiv({ cls: "nc-header-left" });
		const prevBtn = left.createEl("button", { text: "‹", cls: "nc-navbtn" });
		const title = left.createEl("span", { cls: "nc-title" });
		const nextBtn = left.createEl("button", { text: "›", cls: "nc-navbtn" });
		const todayBtn = left.createEl("button", { text: "今天", cls: "nc-today" });

		const seg = header.createDiv({ cls: "nc-segcapsule" });
		for (const [k, label] of [["m", "月"], ["y", "年"]] as const) {
			const b = seg.createEl("button", { text: label, cls: "nc-seg" });
			if (k === this.viewMode) b.addClass("nc-seg-on");
			b.addEventListener("click", () => {
				this.viewMode = k;
				this.render();
			});
		}

		prevBtn.addEventListener("click", () => this.nav(-1));
		nextBtn.addEventListener("click", () => this.nav(1));
		todayBtn.addEventListener("click", () => {
			this.curKey = todayKey();
			this.render();
		});

		this.updateTitle(title);

		const body = outer.createDiv({ cls: "nc-body" });
		if (this.viewMode === "m") this.renderMonth(body);
		else this.renderYear(body);
	}

	private updateTitle(el: HTMLElement) {
		const { y, m } = parseDateKey(this.curKey);
		if (this.viewMode === "y") el.textContent = `${y}年`;
		else el.textContent = `${y}年${m}月`;
	}

	private nav(delta: number) {
		const { y, m, d } = parseDateKey(this.curKey);
		if (this.viewMode === "m") {
			let ny = y, nm = m + delta;
			if (nm < 1) { nm = 12; ny--; }
			if (nm > 12) { nm = 1; ny++; }
			this.curKey = dateKey(ny, nm, Math.min(d, daysInMonth(ny, nm)));
		} else {
			this.curKey = dateKey(y + delta, m, Math.min(d, daysInMonth(y + delta, m)));
		}
		this.render();
	}

	// ============ 月视图 ============
	private renderMonth(container: HTMLElement) {
		const { y, m } = parseDateKey(this.curKey);

		const tool = container.createDiv({ cls: "nc-mtool" });
		tool.createSpan({ text: "卡片间距", cls: "nc-muted" });
		const slider = tool.createEl("input", { type: "range", cls: "nc-slider" }) as HTMLInputElement;
		slider.min = "80";
		slider.max = "150";
		slider.value = String(this.plugin.settings.cellHeight);
		// 拖动时只改高度（流畅），停止后再重排卡片
		slider.addEventListener("input", () => {
			const v = parseInt(slider.value, 10);
			this.plugin.settings.cellHeight = v;
			container.querySelectorAll(".nc-mcell").forEach((el) => {
				(el as HTMLElement).style.height = v + "px";
			});
			if (this.sliderTimer) window.clearTimeout(this.sliderTimer);
			this.sliderTimer = window.setTimeout(() => {
				this.sliderTimer = null;
				this.plugin.saveSettings();
				this.rerenderMonthCards();
			}, 200);
		});

		// 列头独立一行（无 gap 灰竖线）
		const wdRow = container.createDiv({ cls: "nc-mwdrow" });
		for (const wd of WEEK_HEAD) {
			wdRow.createDiv({ cls: "nc-mwd", text: wd });
		}

		const grid = container.createDiv({ cls: "nc-mgrid" });

		const firstDow = (new Date(y, m - 1, 1).getDay() + 6) % 7;
		const dim = daysInMonth(y, m);
		const prevDim = daysInMonth(y, m - 1);
		const cellH = this.plugin.settings.cellHeight;

		const addCell = (k: string, dayNum: number, adj: boolean, isToday: boolean) => {
			const entries = this.plugin.entriesForDate(k);
			const cell = grid.createDiv({ cls: "nc-mcell" + (adj ? " nc-mcell-adj" : "") + (isToday ? " nc-today" : "") });
			cell.style.height = cellH + "px";
			cell.createDiv({ cls: "nc-mdate" + (isToday ? " nc-mdate-today" : ""), text: String(dayNum) });
			const cards = cell.createDiv({ cls: "nc-cards" });
			this.renderEntries(cards, entries, k);
			this.bindDateCell(cell, k);
		};

		for (let i = 0; i < firstDow; i++) {
			const pd = prevDim - firstDow + i + 1;
			const py = m === 1 ? y - 1 : y;
			const pm = m === 1 ? 12 : m - 1;
			addCell(dateKey(py, pm, pd), pd, true, false);
		}
		for (let d = 1; d <= dim; d++) {
			const k = dateKey(y, m, d);
			addCell(k, d, false, k === todayKey());
		}
		const used = firstDow + dim;
		for (let k = used + 1; k <= 42; k++) {
			const nd = k - used;
			const ny = m === 12 ? y + 1 : y;
			const nm = m === 12 ? 1 : m + 1;
			addCell(dateKey(ny, nm, nd), nd, true, false);
		}

		// 移动端：横向滑动切月
		if (this.isMobile) {
			this.attachSwipe(container);
		}
	}

	/** 滑杆停止后重排所有格子内的卡片数量（不重建视图）—— 由 renderEntries 自身算法保证 +N 完整 */
	private rerenderMonthCards() {
		const cells = this.contentEl.querySelectorAll(".nc-mcell");
		cells.forEach((cellEl) => {
			const cards = cellEl.querySelector(".nc-cards") as HTMLElement | null;
			const dk = (cellEl as HTMLElement).dataset.dateKey;
			if (!cards || !dk) return;
			cards.empty();
			this.renderEntries(cards, this.plugin.entriesForDate(dk), dk);
		});
	}

	// ============ 年视图 ============
	private renderYear(container: HTMLElement) {
		const { y } = parseDateKey(this.curKey);

		const topRow = container.createDiv({ cls: "nc-ytop" });
		const lunar = lunarText(y, 8, 1);
		topRow.createSpan({ cls: "nc-muted", text: lunar || "" });
		topRow.createSpan({ cls: "nc-muted", text: "左键点击月份 → 下方展开该月文件" });

		const grid = container.createDiv({ cls: "nc-ygrid" });
		for (let m = 1; m <= 12; m++) {
			const monthBox = grid.createDiv({ cls: "nc-ymo" });
			const hasNotes = this.plugin.monthHasNotes(y, m);
			monthBox.createDiv({ cls: "nc-ymo-title" + (hasNotes ? " nc-ymo-title-has" : ""), text: MONTH_NAMES[m - 1] });
			const cal = monthBox.createDiv({ cls: "nc-ycal" });
			for (const wd of WEEK_HEAD_SHORT) {
				cal.createDiv({ cls: "nc-ywd", text: wd });
			}
			const firstDow = (new Date(y, m - 1, 1).getDay() + 6) % 7;
			const dim = daysInMonth(y, m);
			const prevDim = daysInMonth(y, m - 1);
			const nextDim = daysInMonth(y, m + 1);
			const prevY = m === 1 ? y - 1 : y;
			const prevM = m === 1 ? 12 : m - 1;
			const nextY = m === 12 ? y + 1 : y;
			const nextM = m === 12 ? 1 : m + 1;

			// 用统一 42 格循环填充：先填充前导 + 当月 + 后置，避免边角 case
			const totalCells = 42;
			const cells: { d: number; y: number; m: number; isAdj: boolean }[] = [];
			for (let i = 0; i < firstDow; i++) {
				cells.push({ d: prevDim - firstDow + i + 1, y: prevY, m: prevM, isAdj: true });
			}
			for (let d = 1; d <= dim; d++) {
				cells.push({ d, y, m, isAdj: false });
			}
			let nd = 1;
			while (cells.length < totalCells) {
				cells.push({ d: nd, y: nextY, m: nextM, isAdj: true });
				nd++;
			}

			cells.forEach((it) => {
				const k = dateKey(it.y, it.m, it.d);
				const isToday = k === todayKey() && !it.isAdj;
				const entries = it.isAdj ? [] : this.plugin.entriesForDate(k);
				const cell = cal.createDiv({ cls: "nc-ycell" + (it.isAdj ? " nc-yadj" : "") + (isToday ? " nc-ycell-today" : "") });
				const inner = cell.createDiv({ cls: "nc-ycell-inner" });
				inner.createDiv({ cls: "nc-yday" + (isToday ? " nc-yday-today" : ""), text: String(it.d) });
				if (!isToday && !it.isAdj && entries.length > 0) {
					inner.createDiv({ cls: "nc-yline" });
				}
			});
			monthBox.addEventListener("click", () => this.showYearMonth(container, y, m));
		}

		this.showYearMonth(container, y, parseInt(this.curKey.substring(5, 7), 10));
	}

	private showYearMonth(container: HTMLElement, y: number, m: number) {
		let panel = container.querySelector(".nc-ympanel") as HTMLElement | null;
		if (!panel) panel = container.createDiv({ cls: "nc-ympanel" });
		panel.empty();

		const chipsRow = panel.createDiv({ cls: "nc-chips" });
		const folders = this.plugin.getFolderColors();
		const allChip = chipsRow.createEl("button", { text: "全部", cls: "nc-chip" + (this.yearFilter === "all" ? " nc-chip-on" : "") });
		allChip.addEventListener("click", () => {
			this.yearFilter = "all";
			this.showYearMonth(container, y, m);
		});
		for (const f of folders) {
			const chip = chipsRow.createEl("button", { text: f.query, cls: "nc-chip" + (this.yearFilter === f.query ? " nc-chip-on" : "") });
			chip.addEventListener("click", () => {
				this.yearFilter = f.query;
				this.showYearMonth(container, y, m);
			});
		}

		const all: { d: number; e: NoteEntry }[] = [];
		const dim = daysInMonth(y, m);
		for (let d = 1; d <= dim; d++) {
			for (const e of this.plugin.entriesForDate(dateKey(y, m, d))) {
				all.push({ d, e });
			}
		}
		const filtered = this.yearFilter === "all" ? all : all.filter((it) => it.e.folder === this.yearFilter);

		if (filtered.length === 0) {
			panel.createDiv({ cls: "nc-muted", text: `${y}年${MONTH_NAMES[m - 1]} ${this.yearFilter === "all" ? "没有创建文件" : "没有「" + this.yearFilter + "」文件"}` });
			return;
		}

		panel.createDiv({ cls: "nc-ympanel-title", text: `${y}年${MONTH_NAMES[m - 1]} · ${filtered.length} 个文件` + (this.yearFilter !== "all" ? `（仅${this.yearFilter}）` : "") });
		const list = panel.createDiv({ cls: "nc-ympanel-list" });
		for (const it of filtered) {
			const row = list.createDiv({ cls: "nc-ympanel-row" });
			const color = this.plugin.colorForFolder(it.e.folder);
			row.createDiv({ cls: "nc-dot", attr: { style: `background:${color};border:1px solid ${color};` } });
			row.createSpan({ cls: "nc-ympanel-date", text: it.d + "日" });
			row.createSpan({ cls: "nc-ympanel-name", text: it.e.title });
			row.addEventListener("click", () => this.openNote(it.e.path));
		}
	}

	// ============ 条目渲染（数量随 cellHeight 动态：保证 +N 完整不被裁） ============
	private renderEntries(container: HTMLElement, entries: NoteEntry[], dateKeyStr: string) {
		if (entries.length === 0) return;

		// 按 cellHeight 算两个上限：含 +N 的最大数 / 不含 +N 的最大数
		// 卡片实际 ~13px + gap 1px = 14px；+N 行 ~11px；日期 ~14px；cell padding 上下 8px
		const cellH = this.plugin.settings.cellHeight;
		const PER = 14;
		const PLUS_H = 11;
		const DATE_H = 14;
		const PAD = 8;
		const maxWithPlus = Math.max(3, Math.floor((cellH - DATE_H - PAD - PLUS_H) / PER));
		const maxNoPlus = Math.max(3, Math.floor((cellH - DATE_H - PAD) / PER));

		let visible: NoteEntry[];
		let hidden: number;
		if (entries.length <= maxNoPlus) {
			visible = entries;
			hidden = 0;
		} else {
			visible = entries.slice(0, maxWithPlus);
			hidden = entries.length - maxWithPlus;
		}

		for (const e of visible) {
			const color = this.plugin.colorForFolder(e.folder);
			const card = container.createDiv({
				cls: "nc-card",
				attr: {
					title: e.path,
					style: `background:${tintForCard(color)};color:${color};`,
				},
			});
			card.setText(e.title);
			card.addEventListener("click", (ev) => {
				ev.stopPropagation();
				this.openNote(e.path);
			});
			if (this.isMobile) {
				// 移动端：长按卡片 → 操作菜单（打开/修改日期/移动到日期/清除手动日期）
				this.attachLongPress(card, (x, y) => this.showCardMenuAt(x, y, e));
			} else {
				card.draggable = true;
				card.addEventListener("contextmenu", (ev) => {
					ev.preventDefault();
					ev.stopPropagation();
					this.showCardMenu(ev, e);
				});
				card.addEventListener("dragstart", (ev) => {
					if (!ev.dataTransfer) return;
					ev.dataTransfer.effectAllowed = "move";
					ev.dataTransfer.setData(DRAG_MIME, JSON.stringify({ path: e.path, from: dateKeyStr }));
					ev.dataTransfer.setData("text/plain", e.title);
					card.addClass("nc-card-dragging");
				});
				card.addEventListener("dragend", () => {
					card.removeClass("nc-card-dragging");
				});
			}
		}

		if (hidden > 0) {
			const more = container.createDiv({ cls: "nc-card nc-card-more" });
			more.textContent = `+${hidden} 个`;
		}
	}

	private openNote(path: string) {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			this.app.workspace.getLeaf(true).openFile(file);
		}
	}

	// ============ 卡片菜单 ============
	private showCardMenu(ev: MouseEvent, e: NoteEntry) {
		this.showCardMenuAt(ev.clientX, ev.clientY, e);
	}

	private showCardMenuAt(x: number, y: number, e: NoteEntry) {
		const menu = new Menu();
		menu.addItem((item) =>
			item
				.setTitle("打开笔记")
				.setIcon("document")
				.onClick(() => this.openNote(e.path))
		);
		menu.addItem((item) =>
			item
				.setTitle("修改日期…")
				.setIcon("calendar")
				.onClick(() => this.plugin.promptSetDate(e))
		);
		// 移动端用弹窗选日期移动（桌面端用拖拽）
		if (this.isMobile) {
			menu.addItem((item) =>
				item
					.setTitle("移动到日期…")
					.setIcon("forward")
					.onClick(() => this.moveNoteToDatePicker(e.path))
			);
		}
		menu.addItem((item) =>
			item
				.setTitle("清除手动日期（回到文件 ctime）")
				.setIcon("reset")
				.onClick(async () => {
					this.plugin.store.setManualDate(e.path, undefined);
					this.plugin.settings.manualMap = this.plugin.store.toData();
					await this.plugin.saveSettings();
					this.plugin.rescan();
				})
		);
		menu.addItem((item) =>
			item
				.setTitle("在文件夹中显示")
				.setIcon("folder")
				.onClick(() => {
					const leaf = this.app.workspace.getLeaf(true);
					leaf.openFile(this.app.vault.getAbstractFileByPath(e.path) as TFile);
					this.app.workspace.revealLeaf(leaf);
				})
		);
		menu.showAtPosition({ x, y });
	}

	// ============ 日期单元格交互（右键/长按菜单 + 双击新建 + 拖动接收 + 滑动切月） ============
	private bindDateCell(cell: HTMLElement, dateKeyStr: string) {
		cell.setAttribute("data-date-key", dateKeyStr);
		if (this.isMobile) {
			// 移动端：长按弹新建菜单
			this.attachLongPress(cell, (x, y) => this.showDateMenuAt(x, y, dateKeyStr));
		} else {
			cell.addEventListener("contextmenu", (ev) => {
				ev.preventDefault();
				ev.stopPropagation();
				this.showDateMenu(ev, dateKeyStr);
			});
		}
		cell.addEventListener("dblclick", (ev) => {
			ev.stopPropagation();
			this.createNoteOnDate(dateKeyStr);
		});
		// 拖动接收（桌面端）
		if (!this.isMobile) {
			cell.addEventListener("dragover", (ev) => {
				ev.preventDefault();
				if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
				cell.addClass("nc-drop-target");
			});
			cell.addEventListener("dragleave", () => {
				cell.removeClass("nc-drop-target");
			});
			cell.addEventListener("drop", async (ev) => {
				ev.preventDefault();
				cell.removeClass("nc-drop-target");
				const raw = ev.dataTransfer?.getData(DRAG_MIME);
				if (!raw) return;
				try {
					const data = JSON.parse(raw) as { path: string; from?: string };
					if (data.from === dateKeyStr) return; // 原地落回
					await this.plugin.moveNoteToDate(data.path, dateKeyStr);
					new Notice(`已移动到 ${dateKeyStr}`);
				} catch (err) {
					// ignore
				}
			});
		}
	}

	// ============ 移动端手势 ============
	/** 长按触发（在月视图/卡片上） */
	private attachLongPress(el: HTMLElement, onTrigger: (x: number, y: number) => void) {
		let timer: number | null = null;
		let fired = false;
		el.addEventListener("touchstart", (ev) => {
			const t = ev.touches[0];
			fired = false;
			timer = window.setTimeout(() => {
				fired = true;
				onTrigger(t.clientX, t.clientY);
			}, LONG_PRESS_MS);
		}, { passive: true });
		const cancel = () => {
			if (timer) { window.clearTimeout(timer); timer = null; }
		};
		el.addEventListener("touchmove", () => cancel(), { passive: true });
		el.addEventListener("touchend", () => cancel());
		el.addEventListener("touchcancel", () => cancel());
		// 长按后防止触发 click
		el.addEventListener("click", (ev) => {
			if (fired) { ev.stopPropagation(); fired = false; }
		});
	}

	/** 移动端滑动切月（水平滑动） */
	private attachSwipe(container: HTMLElement) {
		let startX = 0;
		let startY = 0;
		let tracking = false;
		container.addEventListener("touchstart", (ev) => {
			tracking = true;
			startX = ev.touches[0].clientX;
			startY = ev.touches[0].clientY;
		}, { passive: true });
		container.addEventListener("touchmove", (ev) => {
			// 阻止横向滚动
			if (tracking) {
				const dx = ev.touches[0].clientX - startX;
				const dy = ev.touches[0].clientY - startY;
				if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 12) {
					ev.preventDefault();
				}
			}
		}, { passive: false });
		container.addEventListener("touchend", (ev) => {
			if (!tracking) return;
			tracking = false;
			const dx = ev.changedTouches[0].clientX - startX;
			const dy = ev.changedTouches[0].clientY - startY;
			if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
				this.nav(dx < 0 ? 1 : -1);
			}
		}, { passive: true });
	}

	/** 移动端"移动到日期"选择弹窗 */
	private async moveNoteToDatePicker(path: string) {
		const { Modal, Setting } = await import("obsidian");
		class MoveModal extends Modal {
			constructor(app: any, private onPick: (date: string) => void) {
				super(app);
			}
			onOpen() {
				const { contentEl } = this;
				contentEl.empty();
				contentEl.createEl("h3", { text: "移动到日期" });
				const picker = contentEl.createEl("input", { type: "date" }) as HTMLInputElement;
				picker.value = todayKey();
				picker.style.width = "100%";
				picker.style.padding = "8px";
				picker.style.margin = "8px 0 16px";
				const row = contentEl.createDiv({ cls: "nc-modal-buttons" });
				row.createEl("button", { text: "移动", cls: "mod-cta" }).onclick = () => {
					const v = picker.value;
					if (v) this.onPick(v);
					this.close();
				};
				row.createEl("button", { text: "取消" }).onclick = () => this.close();
			}
			onClose() {
				this.contentEl.empty();
			}
		}
		new MoveModal(this.app, async (date) => {
			await this.plugin.moveNoteToDate(path, date);
			new Notice(`已移动到 ${date}`);
		}).open();
	}

	showDateMenu(ev: MouseEvent, dateKeyStr: string) {
		this.showDateMenuAt(ev.clientX, ev.clientY, dateKeyStr);
	}

	/** 弹日期菜单（桌面右键 / 移动长按共用） */
	showDateMenuAt(x: number, y: number, dateKeyStr: string) {
		const menu = new Menu();
		menu.addItem((item) =>
			item
				.setTitle("新建笔记")
				.setIcon("plus")
				.onClick(() => this.createNoteOnDate(dateKeyStr))
		);
		menu.showAtPosition({ x, y });
	}

	private async createNoteOnDate(dateKeyStr: string) {
		const { y, m, d } = parseDateKey(dateKeyStr);
		const name = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
		let path = `${name}.md`;
		let n = 1;
		while (this.app.vault.getAbstractFileByPath(path)) {
			path = `${name}-${n}.md`;
			n++;
		}
		await this.app.vault.create(path, "");
		this.openNote(path);
		new Notice(`已创建 ${path}`);
	}
}

function daysInMonth(y: number, m: number): number {
	return new Date(y, m, 0).getDate();
}