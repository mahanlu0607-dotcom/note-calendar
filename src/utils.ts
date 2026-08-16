import { App, TFile, MetadataCache } from "obsidian";

export interface NoteEntry {
	path: string;
	name: string;
	title: string;
	folder: string;
	dateStr: string;
}

export interface FolderColor {
	query: string;
	hex: string;
}

const DAY_MS = 86400000;

export function dateKey(y: number, m: number, d: number): string {
	return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseDateKey(key: string): { y: number; m: number; d: number } {
	const [y, m, d] = key.split("-").map(Number);
	return { y, m, d };
}

export function todayKey(): string {
	const t = new Date();
	return dateKey(t.getFullYear(), t.getMonth() + 1, t.getDate());
}

export function keyToTs(key: string): number {
	const { y, m, d } = parseDateKey(key);
	return new Date(y, m - 1, d).getTime();
}

export function tsToKey(ts: number): string {
	const t = new Date(ts);
	return dateKey(t.getFullYear(), t.getMonth() + 1, t.getDate());
}

export function addDaysKey(key: string, delta: number): string {
	return tsToKey(keyToTs(key) + delta * DAY_MS);
}

export function startOfWeekKey(key: string): string {
	const { y, m, d } = parseDateKey(key);
	const dow = (new Date(y, m - 1, d).getDay() + 6) % 7;
	return addDaysKey(key, -dow);
}

export function getH1Title(app: App, file: TFile, cache: MetadataCache): string {
	try {
		const meta = cache.getFileCache(file);
		if (meta && meta.headings && meta.headings.length > 0) {
			return meta.headings[0].heading.trim();
		}
	} catch (e) {
		// ignore
	}
	return file.basename;
}

export function getFolder(path: string): string {
	const idx = path.lastIndexOf("/");
	return idx === -1 ? "" : path.substring(0, idx);
}

export function rgbNumToHex(rgb: number): string {
	const r = (rgb >> 16) & 0xff;
	const g = (rgb >> 8) & 0xff;
	const b = rgb & 0xff;
	return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}

export function hexToRgbNum(hex: string): number {
	let h = hex.replace("#", "").trim();
	if (h.length === 3) {
		h = h.split("").map((c) => c + c).join("");
	}
	const r = parseInt(h.substring(0, 2), 16);
	const g = parseInt(h.substring(2, 4), 16);
	const b = parseInt(h.substring(4, 6), 16);
	return (r << 16) | (g << 8) | b;
}

/** 计算用于卡片背景的浅色（把颜色叠到白底 12%） */
export function tintForCard(hex: string): string {
	const r = parseInt(hex.substring(1, 3), 16);
	const g = parseInt(hex.substring(3, 5), 16);
	const b = parseInt(hex.substring(5, 7), 16);
	const mix = (c: number) => Math.round(255 - (255 - c) * 0.12);
	return "#" + [mix(r), mix(g), mix(b)].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}
