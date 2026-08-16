import { App, PluginSettingTab, Setting } from "obsidian";
import NoteCalendarPlugin from "./main";
import { FolderColor } from "./utils";

export interface NoteCalendarSettings {
	/** 卡片间距（月视图格子 min-height） */
	cellHeight: number;
	/** 默认视图: m | y */
	defaultView: string;
	/** 兜底颜色（文件夹未在图谱中配置时） */
	fallbackHex: string;
	/** 手动日期映射: path -> YYYY-MM-DD */
	manualMap: Record<string, string>;
	/** 在 Mac 上模拟移动端界面（预览手机端效果用） */
	simulateMobile: boolean;
}

export const DEFAULT_SETTINGS: NoteCalendarSettings = {
	cellHeight: 86,
	defaultView: "m",
	fallbackHex: "#5B7FE5",
	manualMap: {},
	simulateMobile: false,
};

export class NoteCalendarSettingTab extends PluginSettingTab {
	plugin: NoteCalendarPlugin;

	constructor(app: App, plugin: NoteCalendarPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "笔记日历 Note Calendar" });

		new Setting(containerEl)
			.setName("默认视图")
			.setDesc("打开日历时的初始视图")
			.addDropdown((dd) =>
				dd
					.addOption("m", "月视图")
					.addOption("y", "年视图")
					.setValue(this.plugin.settings.defaultView)
					.onChange(async (v) => {
						this.plugin.settings.defaultView = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("模拟移动端界面")
			.setDesc("在 Mac 上预览手机端效果（手机端布局、长按菜单、滑动切月）。关闭后恢复桌面端。")
			.addToggle((tg) =>
				tg
					.setValue(this.plugin.settings.simulateMobile)
					.onChange(async (v) => {
						this.plugin.settings.simulateMobile = v;
						await this.plugin.saveSettings();
						this.plugin.refreshAllViews();
					})
			);

		new Setting(containerEl)
			.setName("月视图卡片间距")
			.setDesc("月份格子高度（越大卡片间距越大）")
			.addSlider((sl) =>
				sl
					.setLimits(80, 150, 2)
					.setValue(this.plugin.settings.cellHeight)
					.setDynamicTooltip()
					.onChange(async (v) => {
						this.plugin.settings.cellHeight = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("未配置文件夹的默认颜色")
			.setDesc("图谱中没有设置颜色的文件夹，卡片使用此颜色")
			.addText((t) =>
				t.setValue(this.plugin.settings.fallbackHex).onChange(async (v) => {
					this.plugin.settings.fallbackHex = v.startsWith("#") ? v : "#" + v;
					await this.plugin.saveSettings();
					this.plugin.refreshAllViews();
				})
			);

		containerEl.createEl("h3", { text: "文件夹颜色（与关系图谱双向同步）" }).style.marginTop = "24px";
		containerEl.createEl("p", {
			text: "这里的颜色与「关系图谱 → 设置 → 颜色组」实时同步：改这边图谱也变，改图谱这边也变。",
		}).style.color = "var(--text-muted)";
		containerEl.createEl("p", { text: "点击色块选择新颜色。" }).style.color = "var(--text-faint)";

		const groups = this.plugin.getFolderColors();
		if (groups.length === 0) {
			containerEl.createEl("p", {
				text: "图谱颜色组为空。去「关系图谱 → 设置 → 颜色组」添加，或直接点击下方按钮添加文件夹颜色。",
			}).style.color = "var(--text-faint)";
		}

		for (const g of groups) {
			const row = new Setting(containerEl)
				.setName(g.query)
				.setDesc(`path:${g.query}  · 与关系图谱同步`)
				.addColorPicker((cp) =>
					cp
						.setValue(g.hex)
						.onChange(async (val) => {
							await this.plugin.setFolderColor(g.query, val);
							this.display();
						})
				)
				.addExtraButton((btn) =>
					btn
						.setIcon("trash")
						.setTooltip("删除该文件夹的颜色（同时从图谱移除）")
						.onClick(async () => {
							await this.plugin.removeFolderColor(g.query);
							this.display();
						})
				);
			row.settingEl.addClass("note-calendar-color-row");
		}

		new Setting(containerEl)
			.setName("添加文件夹颜色")
			.setDesc("选择 vault 中的一个文件夹并指定颜色")
			.addDropdown((dd) => {
				const folders = this.plugin.getAllFolders();
				for (const f of folders) {
					if (!this.plugin.getFolderColors().some((g) => g.query === f)) {
						dd.addOption(f, f || "（根目录）");
					}
				}
				return dd;
			})
			.addColorPicker((cp) => cp.setValue("#5F5E5A"))
			.addButton((btn) =>
				btn.setButtonText("添加").onClick(async () => {
					const ddEl = (btn.buttonEl.closest(".setting-item") as HTMLElement).querySelector("select") as HTMLSelectElement;
					const folder = ddEl.value;
					if (!folder) return;
					const cpEl = (btn.buttonEl.closest(".setting-item") as HTMLElement).querySelector("input[type=color]") as HTMLInputElement;
					const hex = cpEl.value;
					await this.plugin.setFolderColor(folder, hex);
					this.display();
				})
			);
	}
}
