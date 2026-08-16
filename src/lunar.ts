import { Solar } from "lunar-typescript";

/** 返回农历显示文本，如 "丙午马年 · 农历六月廿三" / "丙午马年 · 农历六月初一" */
export function lunarText(y: number, m: number, d: number): string {
	try {
		const solar = Solar.fromYmd(y, m, d);
		const lunar = solar.getLunar();
		const ganZhi = lunar.getYearInGanZhi();
		const shengXiao = lunar.getYearShengXiao();
		const month = lunar.getMonthInChinese();
		const day = lunar.getDayInChinese();
		return `${ganZhi}${shengXiao}年 · 农历${month}月${day}`;
	} catch (e) {
		return "";
	}
}
