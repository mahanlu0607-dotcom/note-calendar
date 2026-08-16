import { App } from "obsidian";
import { FolderColor, rgbNumToHex, hexToRgbNum } from "./utils";

/**
 * 与 Obsidian 关系图谱颜色组双向同步。
 * 读取 .obsidian/graph.json 的 colorGroups 中 path: 开头的分组；
 * 插件侧修改文件夹颜色时写回 graph.json。
 */
export class GraphColorSync {
	private colorGroups: FolderColor[] = [];
	private initialized = false;

	constructor(private app: App) {}

	private graphPath(): string {
		return ".obsidian/graph.json";
	}

	async load(): Promise<void> {
		try {
			const adapter = this.app.vault.adapter;
			if (!adapter.exists(this.graphPath())) {
				this.colorGroups = [];
				this.initialized = true;
				return;
			}
			const raw = await adapter.read(this.graphPath());
			const json = JSON.parse(raw);
			const groups = Array.isArray(json.colorGroups) ? json.colorGroups : [];
			this.colorGroups = groups
				.filter((g: any) => typeof g?.query === "string" && g.query.trim().startsWith("path:"))
				.map((g: any) => {
					const folder = g.query.replace(/^path\s*:/, "").trim().replace(/"|'/g, "");
					const color = g.color || {};
					let hex = "#000000";
					if (typeof color.rgb === "number") {
						hex = rgbNumToHex(color.rgb);
					} else if (typeof color.r === "number") {
						const toHex = (v: number) => Math.round(v * 255);
						hex =
							"#" +
							[toHex(color.r), toHex(color.g), toHex(color.b)]
								.map((v) => v.toString(16).padStart(2, "0"))
								.join("")
								.toUpperCase();
					}
					return { query: folder, hex };
				});
		} catch (e) {
			this.colorGroups = [];
		}
		this.initialized = true;
	}

	/** 按文件夹获取颜色，没有则 undefined */
	getColor(folder: string): string | undefined {
		if (!this.initialized) return undefined;
		const hit = this.colorGroups.find((g) => g.query === folder);
		return hit?.hex;
	}

	getAllGroups(): FolderColor[] {
		return this.colorGroups.slice();
	}

	async setColor(folder: string, hex: string): Promise<void> {
		if (!this.initialized) await this.load();
		const idx = this.colorGroups.findIndex((g) => g.query === folder);
		if (idx >= 0) {
			this.colorGroups[idx].hex = hex;
		} else {
			this.colorGroups.push({ query: folder, hex });
		}
		await this.writeBack();
	}

	async removeColor(folder: string): Promise<void> {
		if (!this.initialized) await this.load();
		this.colorGroups = this.colorGroups.filter((g) => g.query !== folder);
		await this.writeBack();
	}

	/** 写回 graph.json，尽量保留原有结构 */
	private async writeBack(): Promise<void> {
		try {
			const adapter = this.app.vault.adapter;
			const path = this.graphPath();
			let json: any = {};
			if (await adapter.exists(path)) {
				const raw = await adapter.read(path);
				try {
					json = JSON.parse(raw);
				} catch (e) {
					json = {};
				}
			}
			const groups = (Array.isArray(json.colorGroups) ? json.colorGroups : []).filter(
				(g: any) => !(typeof g?.query === "string" && g.query.trim().startsWith("path:"))
			);
			for (const g of this.colorGroups) {
				groups.push({
					query: `path:${g.query}`,
					color: { a: 1, rgb: hexToRgbNum(g.hex) },
				});
			}
			json.colorGroups = groups;
			await adapter.write(path, JSON.stringify(json, null, 2));
		} catch (e) {
			console.warn("[note-calendar] 写回 graph.json 失败", e);
		}
	}
}
