# Formula MD 前端配色升级实施手册（AI Agent 执行版）

> **本文档的读者是一个 AI 编码代理，不是人类。**
> 文档假设你对本项目一无所知。请严格按照「实施步骤」一节逐步执行，不要自由发挥、不要重构、不要"顺手优化"任何未列出的代码。每一步都给出了精确的修改位置、修改前原文和修改后内容。

---

## 0. 任务概述（一句话）

把 Formula MD 的界面配色从现有的「绿色调」升级为 8 套可选配色方案（4 浅 4 深），数据来源是 https://zeeklog.com/ui-color-aesthetics 的配色浏览器，并新增一个工具栏下拉框让用户切换配色。

**完成后效果**：工具栏右侧出现一个「配色方案」下拉框，共 8 个选项；选择任一方案后界面立即换色并记住选择；原有的浅色/深色切换按钮继续工作（切换深浅时配色回到该模式的默认方案）；PDF 导出永远是白底黑字，不受任何配色影响。

---

## 1. 严格禁止事项（违反任何一条都算任务失败）

1. **禁止**修改 `src/main.js`、`src/preload.js`、`tests/` 下的任何文件。
2. **禁止**修改 `src/renderer/index.html` 中的 CSP `<meta>` 标签（第 6–9 行）。
3. **禁止**修改 `src/renderer/styles.css` 中的 `@media print` 打印样式块（第 1566–1581 行附近）。
4. **禁止**修改 `src/renderer/app.js` 中 `applyAppearance`、`applyTheme` 两个函数（只能新增函数、按本文档修改 `initializeTheme` 和事件绑定）。
5. **禁止**改动 highlight.js 两个 `<link>`（`#hljsLightTheme` / `#hljsDarkTheme`）以及 `app.js` 中控制它们 `disabled` 的逻辑。
6. **禁止**新增任何 npm 依赖、禁止引入任何网络资源（本项目完全离线）。
7. **禁止**使用 CSS 框架或预处理器；只写纯 CSS 和原生 JS。
8. 代码风格必须与现有文件一致：**2 空格缩进、JS 用单引号、语句结尾加分号、CSS 属性每行一个**。
9. 面向用户的文字（下拉框 label、title 属性）用**简体中文或本文档给定的文案**。

---

## 2. 背景知识：项目现状（只读，帮助理解，不要改动）

### 2.1 项目是什么

Formula MD 是一个离线 Markdown + LaTeX 阅读器/编辑器（Electron 应用，无前端框架，纯 HTML/CSS/原生 JS）。界面文件全部在 `src/renderer/` 下：

```
src/renderer/
  index.html   # 页面结构 + CSP 头；按顺序加载 CSS 和 JS
  app.js       # 渲染进程主逻辑（约 1300 行）
  styles.css   # 基础布局、正文、编辑器与打印样式（1691 行，所有媒体都加载）
  glass.css    # 仅屏幕加载（media="screen"）的玻璃拟态材质（450 行）
```

`index.html` 中 CSS 加载顺序（第 13–14 行）：

```html
<link rel="stylesheet" href="styles.css" />
<link rel="stylesheet" href="glass.css" media="screen" />
```

### 2.2 现有主题机制

- 所有颜色都定义为 CSS 自定义属性（变量），集中在**两个文件、共 4 个变量块**中：
  - `styles.css` 第 1–29 行：`:root`（浅色）
  - `styles.css` 第 31–58 行：`:root[data-theme='dark']`（深色）
  - `glass.css` 第 3–34 行：`:root`（浅色，覆盖同名变量并新增玻璃材质变量）
  - `glass.css` 第 36–58 行：`:root[data-theme='dark']`（深色）
- 明暗模式由 `app.js` 控制：`window.formulaMD.setTheme(...)` 通知主进程，主进程回传**已解析**的明暗结果，`applyAppearance()` 把结果写到 `<html>` 标签上，即 `document.documentElement.dataset.theme`，取值只有 `'light'` 或 `'dark'`。CSS 选择器 `:root[data-theme='dark']` 因此生效。
- 用户点 `#themeButton` 切换明暗；当前选择存在 `localStorage` 键 `formula-md-theme` 中。
- 关键点：**改配色 = 改这 4 个变量块的值 + 新增覆盖块，不需要动任何 JS 主题管道**。

### 2.3 变量清单（每个配色块需要定义的变量）

`styles.css` 基础块（25 个，另有不随主题变的 `--article-width` 保持不动）：

```
--accent            主强调色（链接、激活态、焦点框）
--accent-bright     强调色的高亮变体（悬停）
--accent-soft       强调色的透明底（选中背景等）
--bg                应用底色
--surface           卡片/正文面板底色
--sidebar           侧边栏底色
--sidebar-border    侧边栏分隔线
--text              主文字色
--text-secondary    次要文字色
--text-tertiary     最弱文字色
--border            通用边框色
--code-bg           行内代码底色
--quote-bg          引用块底色
--toolbar           工具栏底色（半透明）
--editor-bg         编辑器面板底色
--gutter-bg         行号槽底色
--syntax-text       编辑器语法高亮：普通文字
--syntax-muted      编辑器语法高亮：注释/弱元素
--syntax-heading    编辑器语法高亮：标题标记
--syntax-keyword    编辑器语法高亮：强调/加粗标记
--syntax-string     编辑器语法高亮：链接文字
--syntax-number     编辑器语法高亮：数字/代码
--syntax-symbol     编辑器语法高亮：列表符号
--syntax-selection  编辑器选区底色
--shadow            全局投影
```

`glass.css` 额外变量（9 个，只在这一个文件里定义；`--relief-raised/--relief-hover/--relief-inset/--relief-small/--glass-shadow/--glass-blur/--glass-ease/--relief-transition` 是派生值，**不要动**）：

```
--chrome-base   窗口铬层纯色底
--chrome-tint   窗口铬层半透明色
--glass-fill    玻璃控件填充
--glass-edge    玻璃高光描边
--glass-line    玻璃分隔线
--glass-shade   玻璃暗部
--glass-light   玻璃受光面
--relief-dark   浮雕暗侧
--relief-light  浮雕亮侧
```

注意 `glass.css` 里 `--sidebar` 的值是 `transparent`（由系统毛玻璃透出底色），**新增覆盖块里必须保持 `transparent`**。

---

## 3. 源配色数据（已替你从 zeeklog 页面抓取并核对，直接使用，不要再去访问网络）

| 方案 | 模式 | 色 1 | 色 2 | 色 3（主色） | 色 4 |
| --- | --- | --- | --- | --- | --- |
| Arctic Frost | 浅 | `#E8F0F8` Frost | `#B8D4E8` Glacier | `#6BA3C8` Arctic Blue (primary) | `#2E6B8A` Deep Tide |
| Cloud SaaS | 浅 | `#FAFBFC` Snow | `#E8ECF1` Cloud | `#94A3B8` Slate | `#3B82F6` Sky Blue (primary) |
| Blush & Lavender | 浅 | `#F8E8EE` Blush | `#E8C5D0` Rose | `#C9A0DC` Lavender (primary) | `#9B72CF` Iris |
| Lilac Mist | 浅 | `#F4F0F8` Mist | `#D9CCE8` Wisteria | `#9B89B3` Lavender Gray (primary) | `#3D3450` Plum Ink |
| GitHub Dim | 深 | `#0D1117` Black | `#161B22` Carbon | `#58A6FF` Link Blue (primary) | `#C9D1D9` Text Gray |
| Midnight Indigo | 深 | `#0A0A1A` Ink | `#141432` Midnight | `#1E1E5A` Indigo Deep | `#4F46E5` Electric Indigo (primary) |
| Linear Violet | 深 | `#0A0B1E` Night | `#1C1D2E` Graphite | `#5E6AD2` Linear Violet (primary) | `#E1E2EC` Lilac Mist |
| Stripe Violet | 深 | `#0A2540` Deep Navy | `#635BFF` Stripe Violet (primary) | `#00D4FF` Electric Cyan (accent) | `#F6F9FC` Pale Sky |

**原始 4 色不足以填满 25+ 个变量，所以本文档第 7 节已经替你完成了全部推导。你不需要自己调任何颜色，直接复制第 7 节的成品 CSS。**

---

## 4. 总体设计方案（理解后再动手）

引入**第二个维度：配色方案（palette）**，与现有明暗模式（theme）并存：

- `<html>` 标签上新增 `data-palette` 属性，取值 8 选 1：
  - 浅色方案：`arctic-frost`（默认浅色）、`cloud-saas`、`blush-lavender`、`lilac-mist`
  - 深色方案：`github-dim`（默认深色）、`midnight-indigo`、`linear-violet`、`stripe-violet`
- 每个方案绑定一种明暗模式。用户在配色下拉框中选择方案时，JS 同时把明暗模式切到对应值（复用现有 `applyTheme()`，主进程无需改动）。
- 用户点 `#themeButton` 切明暗时，配色自动重置为该模式的默认方案（浅色→`arctic-frost`，深色→`github-dim`）。
- 用户选择存 `localStorage` 键 `formula-md-palette`。
- CSS 实现：
  1. 把 `styles.css` / `glass.css` 的 4 个基础变量块的值替换成两个默认方案（Arctic Frost / GitHub Dim）——这样 JS 还没运行时也不会有"绿色闪屏"。
  2. 新建 `src/renderer/themes.css`，内含 8 个高优先级覆盖块，每个方案一个，用复合选择器保证优先级高于基础块：
     - 浅色块：`:root[data-palette='xxx']:not([data-theme='dark']) { ... }`
     - 深色块：`:root[data-theme='dark'][data-palette='xxx'] { ... }`
  3. `themes.css` 在 `index.html` 中**最后加载且必须带 `media="screen"`**——这样 `@media print` 打印块不受任何配色影响，PDF 导出永远白底黑字。

**涉及文件一共 5 个**（4 改 1 增）：

| 文件 | 动作 |
| --- | --- |
| `src/renderer/styles.css` | 替换 2 个变量块的值 |
| `src/renderer/glass.css` | 替换 2 个变量块的值 |
| `src/renderer/themes.css` | **新建**，8 个覆盖块 + 下拉框样式 |
| `src/renderer/index.html` | 2 处插入（CSS 链接、下拉框元素） |
| `src/renderer/app.js` | 6 处小编辑（常量、元素登记、2 个新函数、初始化、2 个事件绑定） |

---

## 5. 实施步骤

### 步骤 1：替换 `src/renderer/styles.css` 的浅色基础块

找到文件**第 1–29 行**（以 `:root {` 开头、以 `--article-width: 820px;\n}` 结束的块），把其中第 2–27 行的变量值整体替换。**严格保持行的顺序和变量名不变，只改值。** 替换后该块完整内容必须是：

```css
:root {
  color-scheme: light;
  --accent: #2e6b8a;
  --accent-bright: #4d87a9;
  --accent-soft: rgba(46, 107, 138, 0.1);
  --bg: #f0f5fa;
  --surface: #ffffff;
  --sidebar: rgba(232, 240, 248, 0.86);
  --sidebar-border: rgba(46, 107, 138, 0.1);
  --text: #22303c;
  --text-secondary: #52667a;
  --text-tertiary: #8aa0b4;
  --border: #d6e1eb;
  --code-bg: #e8f0f8;
  --quote-bg: #e3eef8;
  --toolbar: rgba(240, 245, 250, 0.88);
  --editor-bg: #f7fafd;
  --gutter-bg: #e7eff7;
  --syntax-text: #333a42;
  --syntax-muted: #7a828c;
  --syntax-heading: #2e6b8a;
  --syntax-keyword: #b4233d;
  --syntax-string: #25664f;
  --syntax-number: #175ca3;
  --syntax-symbol: #9a6700;
  --syntax-selection: rgba(46, 107, 138, 0.2);
  --shadow: 0 22px 60px rgba(43, 68, 92, 0.13);
  --article-width: 820px;
}
```

### 步骤 2：替换 `src/renderer/styles.css` 的深色基础块

找到**第 31–58 行**的 `:root[data-theme='dark'] { ... }` 块，整体替换为：

```css
:root[data-theme='dark'] {
  color-scheme: dark;
  --accent: #58a6ff;
  --accent-bright: #79c0ff;
  --accent-soft: rgba(88, 166, 255, 0.13);
  --bg: #0d1117;
  --surface: #161b22;
  --sidebar: rgba(22, 27, 34, 0.9);
  --sidebar-border: rgba(255, 255, 255, 0.08);
  --text: #c9d1d9;
  --text-secondary: #8b949e;
  --text-tertiary: #6e7681;
  --border: #30363d;
  --code-bg: #161b22;
  --quote-bg: #16202c;
  --toolbar: rgba(13, 17, 23, 0.88);
  --editor-bg: #0e131b;
  --gutter-bg: #131a23;
  --syntax-text: #dce2ea;
  --syntax-muted: #87919d;
  --syntax-heading: #d2a8ff;
  --syntax-keyword: #ff7b72;
  --syntax-string: #8ed6b4;
  --syntax-number: #79c0ff;
  --syntax-symbol: #e3b341;
  --syntax-selection: rgba(88, 166, 255, 0.22);
  --shadow: 0 22px 60px rgba(0, 0, 0, 0.32);
}
```

**注意**：文件中约第 1566 行还有一个 `@media print` 块，里面的 `:root, :root[data-theme='dark']` 也定义了同名变量——**那是 PDF 打印样式，绝对不要动**。

### 步骤 3：替换 `src/renderer/glass.css` 的浅色基础块

找到文件**第 3–34 行**的 `:root { ... }` 块（到 `--relief-transition: 300ms ease-in-out;\n}` 结束）。**只替换其中的颜色变量值**；`--relief-raised`、`--relief-hover`、`--relief-inset`、`--relief-small`、`--glass-shadow`、`--glass-blur`、`--glass-ease`、`--relief-transition` 这 8 行派生定义**原样保留**。替换后完整内容必须是：

```css
:root {
  --bg: #f0f5fa;
  --surface: #ffffff;
  --sidebar: transparent;
  --text: #22303c;
  --text-secondary: #52667a;
  --text-tertiary: #8aa0b4;
  --border: #d6e1eb;
  --code-bg: #e8f0f8;
  --quote-bg: #e3eef8;
  --toolbar: rgba(228, 237, 245, 0.7);
  --editor-bg: #f7fafd;
  --gutter-bg: #e7eff7;
  --chrome-base: #e4edf5;
  --chrome-tint: rgba(228, 237, 245, 0.76);
  --glass-fill: rgba(228, 237, 245, 0.64);
  --glass-edge: rgba(255, 255, 255, 0.64);
  --glass-line: rgba(62, 96, 120, 0.13);
  --glass-shade: rgba(46, 80, 106, 0.1);
  --glass-light: rgba(255, 255, 255, 0.5);
  /* All relief shares a top-left light source and the existing cool gray hue. */
  --relief-dark: rgba(104, 136, 158, 0.3);
  --relief-light: rgba(255, 255, 255, 0.88);
  --relief-raised: 6px 6px 12px var(--relief-dark), -6px -6px 12px var(--relief-light);
  --relief-hover: 3px 3px 6px var(--relief-dark), -3px -3px 6px var(--relief-light);
  --relief-inset: inset 4px 4px 8px var(--relief-dark), inset -4px -4px 8px var(--relief-light);
  --relief-small: inset 2px 2px 4px var(--relief-dark), inset -2px -2px 4px var(--relief-light);
  --glass-shadow: 9px 9px 20px var(--relief-dark), -9px -9px 20px var(--relief-light), inset 1px 1px 0 var(--glass-edge), inset -1px -1px 0 var(--glass-shade);
  --glass-blur: blur(18px) saturate(1.35);
  --glass-ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  --relief-transition: 300ms ease-in-out;
}
```

### 步骤 4：替换 `src/renderer/glass.css` 的深色基础块

找到**第 36–58 行**的 `:root[data-theme='dark'] { ... }` 块，整体替换为（注意 `--sidebar` 保持 `transparent`）：

```css
:root[data-theme='dark'] {
  --bg: #0d1117;
  --surface: #161b22;
  --sidebar: transparent;
  --text: #c9d1d9;
  --text-secondary: #8b949e;
  --text-tertiary: #6e7681;
  --border: #30363d;
  --code-bg: #161b22;
  --quote-bg: #16202c;
  --toolbar: rgba(22, 27, 34, 0.7);
  --editor-bg: #0e131b;
  --gutter-bg: #131a23;
  --chrome-base: #161b22;
  --chrome-tint: rgba(22, 27, 34, 0.82);
  --glass-fill: rgba(22, 27, 34, 0.68);
  --glass-edge: rgba(210, 225, 255, 0.12);
  --glass-line: rgba(180, 200, 220, 0.1);
  --glass-shade: rgba(0, 0, 0, 0.28);
  --glass-light: rgba(190, 210, 235, 0.12);
  --relief-dark: rgba(2, 6, 10, 0.5);
  --relief-light: rgba(58, 68, 80, 0.3);
}
```

### 步骤 5：新建 `src/renderer/themes.css`

创建新文件 `src/renderer/themes.css`，**完整内容见本文档第 7 节，一字不差地整体复制进去**。文件包含：

- 8 个配色覆盖块（选择器分别是 `:root[data-palette='...']:not([data-theme='dark'])` 或 `:root[data-theme='dark'][data-palette='...']`）
- 配色下拉框 `.palette-select` 的样式

### 步骤 6：修改 `src/renderer/index.html`（2 处插入）

**插入 1**：在第 14 行（`<link rel="stylesheet" href="glass.css" media="screen" />`）**之后**新增一行，缩进与上一行一致（4 空格）：

```html
    <link rel="stylesheet" href="themes.css" media="screen" />
```

⚠️ `media="screen"` 不可省略，否则打印/PDF 会被配色污染。

**插入 2**：找到这段（约第 107 行）：

```html
            <button id="themeButton" class="icon-button glass-control" type="button" title="切换主题" aria-label="切换主题">
```

在它**之前**插入（缩进 12 空格，与 button 对齐）：

```html
            <select id="paletteSelect" class="palette-select glass-control" title="配色方案" aria-label="配色方案">
              <option value="arctic-frost">Arctic Frost 极地霜</option>
              <option value="cloud-saas">Cloud SaaS 云端蓝</option>
              <option value="blush-lavender">Blush &amp; Lavender 胭粉薰衣草</option>
              <option value="lilac-mist">Lilac Mist 丁香雾</option>
              <option value="github-dim">GitHub Dim 暗夜</option>
              <option value="midnight-indigo">Midnight Indigo 午夜靛蓝</option>
              <option value="linear-violet">Linear Violet 线性紫</option>
              <option value="stripe-violet">Stripe Violet 条纹紫</option>
            </select>
```

注意 `Blush &amp; Lavender` 里的 `&amp;` 是 HTML 转义，不要写成 `&`。

### 步骤 7：修改 `src/renderer/app.js`（6 处小编辑）

**编辑 1 — 新增常量**：在第 1 行 `const SESSION_KEY = 'formula-md-tab-session-v1';` **之后**插入：

```js
const PALETTES = {
  'arctic-frost': { mode: 'light' },
  'cloud-saas': { mode: 'light' },
  'blush-lavender': { mode: 'light' },
  'lilac-mist': { mode: 'light' },
  'github-dim': { mode: 'dark' },
  'midnight-indigo': { mode: 'dark' },
  'linear-violet': { mode: 'dark' },
  'stripe-violet': { mode: 'dark' }
};
const DEFAULT_PALETTE = { light: 'arctic-frost', dark: 'github-dim' };
```

**编辑 2 — 登记 DOM 元素**：在 `elements` 对象里 `outlineSection: ...` 一行之后、`pdfButton: ...` 一行之前（按字母序）插入：

```js
  paletteSelect: document.querySelector('#paletteSelect'),
```

**编辑 3 — 新增两个函数**：找到 `function applyTheme(theme) {` 这个函数（约第 1087 行），在它**之前**插入下面两个完整函数：

```js
function applyPalette(paletteId, options = {}) {
  const palette = PALETTES[paletteId] ? paletteId : DEFAULT_PALETTE.light;
  localStorage.setItem('formula-md-palette', palette);
  document.documentElement.dataset.palette = palette;
  if (elements.paletteSelect) elements.paletteSelect.value = palette;
  if (!options.keepTheme) applyTheme(PALETTES[palette].mode);
}

function initializePalette() {
  const stored = localStorage.getItem('formula-md-palette');
  const resolvedTheme = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const palette = PALETTES[stored] ? stored : DEFAULT_PALETTE[resolvedTheme];
  document.documentElement.dataset.palette = palette;
  if (elements.paletteSelect) elements.paletteSelect.value = palette;
  if (PALETTES[palette].mode !== resolvedTheme) applyTheme(PALETTES[palette].mode);
}
```

**编辑 4 — 修改 `initializeTheme`**：找到（约第 1092–1096 行）：

```js
function initializeTheme() {
  const stored = localStorage.getItem('formula-md-theme');
  window.formulaMD.onAppearanceChanged(applyAppearance);
  window.formulaMD.setTheme(['dark', 'light'].includes(stored) ? stored : 'system').then(applyAppearance);
}
```

替换为（只改最后一行，前两行不动）：

```js
function initializeTheme() {
  const stored = localStorage.getItem('formula-md-theme');
  window.formulaMD.onAppearanceChanged(applyAppearance);
  window.formulaMD.setTheme(['dark', 'light'].includes(stored) ? stored : 'system').then((appearance) => {
    applyAppearance(appearance);
    initializePalette();
  });
}
```

**编辑 5 — 修改 `#themeButton` 点击事件**：找到（约第 1136–1138 行）：

```js
elements.themeButton.addEventListener('click', () => {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});
```

替换为：

```js
elements.themeButton.addEventListener('click', () => {
  const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyPalette(DEFAULT_PALETTE[nextTheme], { keepTheme: true });
  applyTheme(nextTheme);
});
```

**编辑 6 — 新增下拉框事件**：在编辑 5 的那段代码**之后**紧接着新增：

```js
elements.paletteSelect.addEventListener('change', () => {
  applyPalette(elements.paletteSelect.value);
});
```

### 步骤 8：验证（必做，见第 6 节）

---

## 6. 验证清单（按顺序逐项执行，全部通过才算完成）

1. **语法检查**：在项目根目录运行 `npm test`，必须全部通过（本次改动不涉及被测模块，若有失败说明改错了文件）。
2. **HTML 结构检查**：运行 `grep -c 'paletteSelect' src/renderer/index.html`，结果必须是 `1`；运行 `grep -c 'themes.css' src/renderer/index.html`，结果必须是 `1`。
3. **CSS 完整性检查**：运行 `grep -c "data-palette" src/renderer/themes.css`，结果必须是 `8`（8 个覆盖块各出现一次）。运行 `grep -c '^}' src/renderer/themes.css` 应不小于 `9`。
4. **JS 语法检查**：运行 `node --check src/renderer/app.js`，必须无输出、退出码 0。
5. **打印隔离检查**：`grep 'media="screen"' src/renderer/index.html` 的输出必须包含 `themes.css` 那一行。
6. **手动界面验证**：运行 `npm start` 启动应用，打开 `examples/latex-showcase.md`，逐项确认：
   - [ ] 工具栏右侧出现配色下拉框，共 8 个选项
   - [ ] 依次选择 8 个方案，每次界面立即换色，且选择浅色方案时界面为浅色、深色方案时为深色
   - [ ] 切换配色后**重启应用**，配色保持
   - [ ] 点明暗切换按钮：深色→浅色时配色变回 Arctic Frost；浅色→深色时配色变回 GitHub Dim
   - [ ] 阅读模式和编辑模式（含行号、语法高亮）在 8 个方案下都清晰可读
   - [ ] 任意方案下导出 PDF，PDF 为白底黑字（与改前一致）
   - [ ] 窗口靠边控件（按钮、标签页）的玻璃浮雕效果仍然存在，没有变成纯色块
7. **如发现任何一项不通过**：回滚对应文件后重新执行该步骤，不要带着问题上交。

---

## 7. `themes.css` 完整内容（步骤 5 用，从下一行开始到文件末尾整体复制）

```css
/* Palette overrides for Formula MD.
   Loaded last and screen-only so print/PDF styles stay untouched.
   Each palette binds to a light or dark mode; app.js keeps data-theme
   and data-palette consistent on <html>. */

/* ============ Light palettes ============ */

:root[data-palette='arctic-frost']:not([data-theme='dark']) {
  --accent: #2e6b8a;
  --accent-bright: #4d87a9;
  --accent-soft: rgba(46, 107, 138, 0.1);
  --bg: #f0f5fa;
  --surface: #ffffff;
  --sidebar: transparent;
  --sidebar-border: rgba(46, 107, 138, 0.1);
  --text: #22303c;
  --text-secondary: #52667a;
  --text-tertiary: #8aa0b4;
  --border: #d6e1eb;
  --code-bg: #e8f0f8;
  --quote-bg: #e3eef8;
  --toolbar: rgba(228, 237, 245, 0.7);
  --editor-bg: #f7fafd;
  --gutter-bg: #e7eff7;
  --syntax-text: #333a42;
  --syntax-muted: #7a828c;
  --syntax-heading: #2e6b8a;
  --syntax-keyword: #b4233d;
  --syntax-string: #25664f;
  --syntax-number: #175ca3;
  --syntax-symbol: #9a6700;
  --syntax-selection: rgba(46, 107, 138, 0.2);
  --shadow: 0 22px 60px rgba(43, 68, 92, 0.13);
  --chrome-base: #e4edf5;
  --chrome-tint: rgba(228, 237, 245, 0.76);
  --glass-fill: rgba(228, 237, 245, 0.64);
  --glass-edge: rgba(255, 255, 255, 0.64);
  --glass-line: rgba(62, 96, 120, 0.13);
  --glass-shade: rgba(46, 80, 106, 0.1);
  --glass-light: rgba(255, 255, 255, 0.5);
  --relief-dark: rgba(104, 136, 158, 0.3);
  --relief-light: rgba(255, 255, 255, 0.88);
}

:root[data-palette='cloud-saas']:not([data-theme='dark']) {
  --accent: #2563eb;
  --accent-bright: #3b82f6;
  --accent-soft: rgba(59, 130, 246, 0.1);
  --bg: #fafbfc;
  --surface: #ffffff;
  --sidebar: transparent;
  --sidebar-border: rgba(15, 23, 42, 0.08);
  --text: #0f172a;
  --text-secondary: #475569;
  --text-tertiary: #94a3b8;
  --border: #e2e8f0;
  --code-bg: #f1f5f9;
  --quote-bg: #eff4fc;
  --toolbar: rgba(232, 236, 241, 0.7);
  --editor-bg: #fcfdfe;
  --gutter-bg: #eef2f7;
  --syntax-text: #333a42;
  --syntax-muted: #7a828c;
  --syntax-heading: #2563eb;
  --syntax-keyword: #b4233d;
  --syntax-string: #25664f;
  --syntax-number: #175ca3;
  --syntax-symbol: #9a6700;
  --syntax-selection: rgba(59, 130, 246, 0.2);
  --shadow: 0 22px 60px rgba(15, 23, 42, 0.12);
  --chrome-base: #e8ecf1;
  --chrome-tint: rgba(232, 236, 241, 0.76);
  --glass-fill: rgba(232, 236, 241, 0.64);
  --glass-edge: rgba(255, 255, 255, 0.64);
  --glass-line: rgba(71, 85, 105, 0.13);
  --glass-shade: rgba(71, 85, 105, 0.1);
  --glass-light: rgba(255, 255, 255, 0.5);
  --relief-dark: rgba(120, 134, 156, 0.3);
  --relief-light: rgba(255, 255, 255, 0.88);
}

:root[data-palette='blush-lavender']:not([data-theme='dark']) {
  --accent: #9b72cf;
  --accent-bright: #b08cdd;
  --accent-soft: rgba(155, 114, 207, 0.1);
  --bg: #fbf4f7;
  --surface: #ffffff;
  --sidebar: transparent;
  --sidebar-border: rgba(122, 63, 90, 0.1);
  --text: #3a2a33;
  --text-secondary: #7a5f6e;
  --text-tertiary: #b095a2;
  --border: #ebd6df;
  --code-bg: #f6ebf0;
  --quote-bg: #f6e9f3;
  --toolbar: rgba(242, 226, 233, 0.7);
  --editor-bg: #fdf9fb;
  --gutter-bg: #f4e7ed;
  --syntax-text: #333a42;
  --syntax-muted: #7a828c;
  --syntax-heading: #9b72cf;
  --syntax-keyword: #b4233d;
  --syntax-string: #25664f;
  --syntax-number: #175ca3;
  --syntax-symbol: #9a6700;
  --syntax-selection: rgba(155, 114, 207, 0.2);
  --shadow: 0 22px 60px rgba(90, 58, 74, 0.13);
  --chrome-base: #f2e2e9;
  --chrome-tint: rgba(242, 226, 233, 0.76);
  --glass-fill: rgba(242, 226, 233, 0.64);
  --glass-edge: rgba(255, 255, 255, 0.64);
  --glass-line: rgba(122, 95, 110, 0.13);
  --glass-shade: rgba(122, 95, 110, 0.1);
  --glass-light: rgba(255, 255, 255, 0.5);
  --relief-dark: rgba(150, 116, 132, 0.3);
  --relief-light: rgba(255, 255, 255, 0.88);
}

:root[data-palette='lilac-mist']:not([data-theme='dark']) {
  --accent: #6f5b8d;
  --accent-bright: #9b89b3;
  --accent-soft: rgba(111, 91, 141, 0.1);
  --bg: #f8f6fb;
  --surface: #ffffff;
  --sidebar: transparent;
  --sidebar-border: rgba(61, 52, 80, 0.1);
  --text: #3d3450;
  --text-secondary: #6e6383;
  --text-tertiary: #a193b8;
  --border: #e3dbed;
  --code-bg: #f1edf7;
  --quote-bg: #f0eaf7;
  --toolbar: rgba(234, 228, 242, 0.7);
  --editor-bg: #fbfafd;
  --gutter-bg: #eee9f5;
  --syntax-text: #333a42;
  --syntax-muted: #7a828c;
  --syntax-heading: #6f5b8d;
  --syntax-keyword: #b4233d;
  --syntax-string: #25664f;
  --syntax-number: #175ca3;
  --syntax-symbol: #9a6700;
  --syntax-selection: rgba(111, 91, 141, 0.2);
  --shadow: 0 22px 60px rgba(61, 52, 80, 0.13);
  --chrome-base: #eae4f2;
  --chrome-tint: rgba(234, 228, 242, 0.76);
  --glass-fill: rgba(234, 228, 242, 0.64);
  --glass-edge: rgba(255, 255, 255, 0.64);
  --glass-line: rgba(93, 79, 120, 0.13);
  --glass-shade: rgba(93, 79, 120, 0.1);
  --glass-light: rgba(255, 255, 255, 0.5);
  --relief-dark: rgba(131, 114, 154, 0.3);
  --relief-light: rgba(255, 255, 255, 0.88);
}

/* ============ Dark palettes ============ */

:root[data-theme='dark'][data-palette='github-dim'] {
  --accent: #58a6ff;
  --accent-bright: #79c0ff;
  --accent-soft: rgba(88, 166, 255, 0.13);
  --bg: #0d1117;
  --surface: #161b22;
  --sidebar: transparent;
  --sidebar-border: rgba(255, 255, 255, 0.08);
  --text: #c9d1d9;
  --text-secondary: #8b949e;
  --text-tertiary: #6e7681;
  --border: #30363d;
  --code-bg: #161b22;
  --quote-bg: #16202c;
  --toolbar: rgba(22, 27, 34, 0.7);
  --editor-bg: #0e131b;
  --gutter-bg: #131a23;
  --syntax-text: #dce2ea;
  --syntax-muted: #87919d;
  --syntax-heading: #d2a8ff;
  --syntax-keyword: #ff7b72;
  --syntax-string: #8ed6b4;
  --syntax-number: #79c0ff;
  --syntax-symbol: #e3b341;
  --syntax-selection: rgba(88, 166, 255, 0.22);
  --shadow: 0 22px 60px rgba(0, 0, 0, 0.32);
  --chrome-base: #161b22;
  --chrome-tint: rgba(22, 27, 34, 0.82);
  --glass-fill: rgba(22, 27, 34, 0.68);
  --glass-edge: rgba(210, 225, 255, 0.12);
  --glass-line: rgba(180, 200, 220, 0.1);
  --glass-shade: rgba(0, 0, 0, 0.28);
  --glass-light: rgba(190, 210, 235, 0.12);
  --relief-dark: rgba(2, 6, 10, 0.5);
  --relief-light: rgba(58, 68, 80, 0.3);
}

:root[data-theme='dark'][data-palette='midnight-indigo'] {
  --accent: #6c63f0;
  --accent-bright: #8a83ff;
  --accent-soft: rgba(108, 99, 240, 0.15);
  --bg: #0a0a1a;
  --surface: #141432;
  --sidebar: transparent;
  --sidebar-border: rgba(255, 255, 255, 0.08);
  --text: #e3e4f2;
  --text-secondary: #9da0c3;
  --text-tertiary: #6b6d94;
  --border: #292950;
  --code-bg: #12122c;
  --quote-bg: #181840;
  --toolbar: rgba(20, 20, 50, 0.7);
  --editor-bg: #0c0c21;
  --gutter-bg: #12122c;
  --syntax-text: #dce2ea;
  --syntax-muted: #87919d;
  --syntax-heading: #c4b5fd;
  --syntax-keyword: #ff7b72;
  --syntax-string: #8ed6b4;
  --syntax-number: #79c0ff;
  --syntax-symbol: #e3b341;
  --syntax-selection: rgba(108, 99, 240, 0.24);
  --shadow: 0 22px 60px rgba(0, 0, 0, 0.36);
  --chrome-base: #141432;
  --chrome-tint: rgba(20, 20, 50, 0.82);
  --glass-fill: rgba(20, 20, 50, 0.68);
  --glass-edge: rgba(200, 200, 255, 0.12);
  --glass-line: rgba(170, 170, 230, 0.1);
  --glass-shade: rgba(0, 0, 0, 0.3);
  --glass-light: rgba(180, 180, 240, 0.12);
  --relief-dark: rgba(3, 3, 12, 0.5);
  --relief-light: rgba(52, 52, 96, 0.3);
}

:root[data-theme='dark'][data-palette='linear-violet'] {
  --accent: #6c77dd;
  --accent-bright: #8a92e8;
  --accent-soft: rgba(94, 106, 210, 0.15);
  --bg: #0a0b1e;
  --surface: #1c1d2e;
  --sidebar: transparent;
  --sidebar-border: rgba(255, 255, 255, 0.08);
  --text: #e1e2ec;
  --text-secondary: #9c9fb8;
  --text-tertiary: #6a6d8c;
  --border: #2e3049;
  --code-bg: #151627;
  --quote-bg: #1b1c36;
  --toolbar: rgba(28, 29, 46, 0.7);
  --editor-bg: #0d0e24;
  --gutter-bg: #151628;
  --syntax-text: #dce2ea;
  --syntax-muted: #87919d;
  --syntax-heading: #b7bdf5;
  --syntax-keyword: #ff7b72;
  --syntax-string: #8ed6b4;
  --syntax-number: #79c0ff;
  --syntax-symbol: #e3b341;
  --syntax-selection: rgba(94, 106, 210, 0.24);
  --shadow: 0 22px 60px rgba(0, 0, 0, 0.34);
  --chrome-base: #1c1d2e;
  --chrome-tint: rgba(28, 29, 46, 0.82);
  --glass-fill: rgba(28, 29, 46, 0.68);
  --glass-edge: rgba(205, 208, 255, 0.12);
  --glass-line: rgba(175, 180, 225, 0.1);
  --glass-shade: rgba(0, 0, 0, 0.28);
  --glass-light: rgba(190, 195, 240, 0.12);
  --relief-dark: rgba(4, 5, 14, 0.5);
  --relief-light: rgba(64, 66, 100, 0.3);
}

:root[data-theme='dark'][data-palette='stripe-violet'] {
  --accent: #7a74ff;
  --accent-bright: #948fff;
  --accent-soft: rgba(122, 116, 255, 0.15);
  --bg: #0a2540;
  --surface: #0f2d4d;
  --sidebar: transparent;
  --sidebar-border: rgba(255, 255, 255, 0.09);
  --text: #e6eef7;
  --text-secondary: #9bb2c8;
  --text-tertiary: #6b87a3;
  --border: #1f4166;
  --code-bg: #0d2b49;
  --quote-bg: #11304f;
  --toolbar: rgba(15, 45, 77, 0.7);
  --editor-bg: #0b2340;
  --gutter-bg: #0f2c4b;
  --syntax-text: #dce2ea;
  --syntax-muted: #87919d;
  --syntax-heading: #c7bfff;
  --syntax-keyword: #ff7b72;
  --syntax-string: #8ed6b4;
  --syntax-number: #79c0ff;
  --syntax-symbol: #e3b341;
  --syntax-selection: rgba(122, 116, 255, 0.24);
  --shadow: 0 22px 60px rgba(2, 10, 20, 0.4);
  --chrome-base: #0f2d4d;
  --chrome-tint: rgba(15, 45, 77, 0.82);
  --glass-fill: rgba(15, 45, 77, 0.68);
  --glass-edge: rgba(190, 220, 255, 0.12);
  --glass-line: rgba(150, 190, 230, 0.1);
  --glass-shade: rgba(0, 8, 18, 0.3);
  --glass-light: rgba(170, 205, 245, 0.12);
  --relief-dark: rgba(2, 10, 20, 0.5);
  --relief-light: rgba(38, 70, 105, 0.3);
}

/* ============ Palette picker control ============ */

.palette-select {
  appearance: none;
  border: 0;
  margin: 0;
  padding: 5px 10px;
  border-radius: 8px;
  background: var(--glass-fill, var(--surface));
  color: var(--text-secondary);
  font: inherit;
  font-size: 12px;
  line-height: 1.4;
  cursor: pointer;
  outline: none;
  max-width: 170px;
}

.palette-select:hover {
  color: var(--text);
}

.palette-select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
```

---

## 8. 常见问题（FAQ，遇到时对照处理）

**Q1：改完后界面还是旧绿色？**
A：检查 `index.html` 中 `themes.css` 是否真的加载了（必须位于 `glass.css` 之后）；检查浏览器/Electron 是否缓存——重启应用。另外确认你同时完成了步骤 1–4（基础块替换），否则无 `data-palette` 的初始状态仍是旧色。

**Q2：导出 PDF 变色了？**
A：一定是 `themes.css` 的 `<link>` 漏了 `media="screen"`，或者你改了 `styles.css` 的 `@media print` 块。按第 1 节禁令回滚。

**Q3：下拉框选中项和实际配色不一致？**
A：检查 `app.js` 编辑 3 中 `applyPalette` 与 `initializePalette` 是否都包含 `elements.paletteSelect.value = palette;` 这行。

**Q4：深色方案选择后界面仍是浅色？**
A：`applyPalette` 末尾的 `applyTheme(PALETTES[palette].mode)` 丢了，或 `PALETTES` 常量里该方案的 `mode` 写错。

**Q5：`node --test` 有失败？**
A：本次改动不涉及 `tests/` 覆盖的模块，失败说明你误改了 `math-protector.js`、`markdown-source-highlighter.js`、`editor-state.js` 之一，回滚该文件。

**Q6：玻璃浮雕效果消失（控件变平）？**
A：你在 glass.css 或 themes.css 中改动/删除了 `--relief-raised`、`--glass-shadow` 等派生变量。它们只在 glass.css 定义一次，覆盖块里不需要也不能重复定义。

---

## 9. 配色映射说明（可选阅读，说明推导逻辑，不需要执行）

- `--bg`/`--surface`/`--code-bg` 取源配色中最浅的两色；深色方案取最深的两色。
- `--accent` 取源配色 `primary` 角色色；浅色方案中若主色太浅（如 Arctic Blue `#6BA3C8`、Lavender Gray `#9B89B3`），改用同族更深的颜色保证白底对比度 ≥ 4.5:1；深色方案中主色适当提亮（如 `#4F46E5`→`#6C63F0`）保证暗底可读。
- `--accent-bright` 为主色提亮约 15–25% 的悬停变体；`--accent-soft`/`--syntax-selection` 是主色加 0.1–0.24 透明度。
- 文字三色（`--text`/`--text-secondary`/`--text-tertiary`）按源配色色相取 3 个明度梯度。
- 语法高亮在 4 浅方案间共享一套（GitHub light 风格）、4 深方案间共享一套（GitHub dark 风格），只有 `--syntax-heading` 与 `--syntax-selection` 跟随各方案主色，保证代码可读性一致。
- 玻璃材质变量（`--chrome-*`、`--glass-*`、`--relief-*`）沿用具方案底色/文字色的 rgba 变体，保持原有「左上光源」浮雕体系不变。

数据来源：[zeeklog.com UI配色美学](https://zeeklog.com/ui-color-aesthetics)（105 套配色中的 8 套，色值已按页面内嵌数据逐一核对）。
