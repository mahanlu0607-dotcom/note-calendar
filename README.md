# 笔记日历 Note Calendar (Obsidian 插件)

在 Obsidian 中按「创建日期」把笔记展示在日历上，支持 **月 / 年** 双视图，
文件夹配色与**关系图谱颜色组双向同步**。macOS 日历风格，桌面端与移动端（iPhone）均可使用。

## 功能

- **月 / 年 双视图**，顶部胶囊切换，macOS 日历风格
- **自动记录创建日期**：读取文件系统 ctime；可手动把任意笔记指定到任意日期
- **月视图**：卡片间距可调（滑杆），周一永远在第一竖列；卡片可拖拽到其他日期（桌面端）
- **点击笔记卡片直接跳转**打开对应笔记
- **右键日期** → 新建笔记；**双击日期** → 新建笔记
- **右键笔记卡片** → 打开笔记 / 修改日期…
- **年视图**：点击月份展开该月文件列表，可按文件夹筛选；有笔记的日期显示红色细横线
- **文件夹颜色与关系图谱双向同步**（读写 `.obsidian/graph.json` 的 colorGroups）
- **农历显示**（年视图）
- **移动端适配**：长按呼出菜单、左右滑动切换月份、触控区加大；设置里可开启「模拟移动端界面」在桌面端预览手机效果

## 安装

### 手动安装（推荐，未上架前）

把 `main.js`、`manifest.json`、`styles.css` 复制到：

```
<vault>/.obsidian/plugins/note-calendar/
```

然后 Obsidian → 设置 → 第三方插件 → 启用「笔记日历 Note Calendar」。

### 手机端（iPhone）

插件文件需进入手机 vault 的 `.obsidian/plugins/note-calendar/` 目录。可先同步笔记到手机后手动放入插件文件，或使用支持同步配置目录的同步方案。

## 开发

```bash
npm install
npm run dev      # watch 模式
npm run build    # 生产构建，输出 main.js
```

## 数据说明

- 手动日期映射存在插件的 `data.json`（`manualMap` 字段）
- 颜色配置存在 `.obsidian/graph.json`（`colorGroups` 中 `path:` 分组），与关系图谱共享

## License

MIT
