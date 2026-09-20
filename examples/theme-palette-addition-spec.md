# Formula MD 配色新增实施手册：IBM Blue / Vapor Chrome / Ultra Violet / Sapphire Ice（AI Agent 执行版）

> **本文档的读者是一个 AI 编码代理，不是人类。**
> 本项目已经拥有一套 8 配色系统（由《theme-palette-upgrade-spec.md》实施完成）。本文档的任务是在该系统上**新增 4 套配色**，使总数从 8 变为 12。请严格按步骤执行，不要自由发挥、不要重构、不要改动任何未列出的代码。

---

## 0. 前置检查（先做，不通过就停止并报告）

在项目根目录依次运行以下命令，**全部通过才能继续**：

```bash
grep -c "data-palette" src/renderer/themes.css   # 必须输出 8
grep -c "paletteSelect" src/renderer/index.html   # 必须输出 1
grep -c "themes.css" src/renderer/index.html      # 必须输出 1
grep -n "const PALETTES = {" src/renderer/app.js  # 必须能找到一个匹配（约第 2 行）
```

如果任何一条不满足，说明多配色系统尚未建成。**停止执行并报告**："前置检查失败，多配色系统不存在"。不要尝试自己重建整个系统。

---

## 1. 任务概述（一句话）

新增 4 套配色方案：IBM Blue（浅色）、Vapor Chrome（浅色）、Sapphire Ice（浅色）、Ultra Violet（深色）。只改 3 个文件、共 3 处插入，**全部是纯新增，不修改任何已有行**：

| 文件 | 动作 |
| --- | --- |
| `src/renderer/themes.css` | 追加 4 个配色覆盖块（完整 CSS 已在本文件第 5 节给出，直接复制） |
| `src/renderer/index.html` | 在下拉框中插入 4 个 `<option>` |
| `src/renderer/app.js` | 在 `PALETTES` 常量中插入 4 行 |

---

## 2. 严格禁止事项

1. **禁止**修改 `src/main.js`、`src/preload.js`、`tests/` 下任何文件。
2. **禁止**修改 `themes.css` 中已有的 8 个配色块、`.palette-select` 样式块。
3. **禁止**修改 `styles.css`、`glass.css`（本次任务完全不涉及它们）。
4. **禁止**修改 `index.html` 的 CSP `<meta>` 标签和第 108 行 `<select>` 标签本身（只往里插 `<option>`）。
5. **禁止**修改 `app.js` 中除 `PALETTES` 常量外的任何代码（`DEFAULT_PALETTE`、函数、事件绑定都保持原样）。
6. 代码风格：CSS 属性每行一个、2 空格缩进；JS 用单引号、句尾分号。

---

## 3. 源配色数据与明暗归属（已从 zeeklog 页面核对，直接使用，不要再访问网络）

| 方案 | slug | 明暗归属 | 源色板（4 色） |
| --- | --- | --- | --- |
| IBM Blue | `ibm-blue` | **浅色** | `#0F62FE` IBM Blue (primary) · `#0043CE` Royal Blue · `#161616` Charcoal · `#F4F4F4` Cool Gray |
| Vapor Chrome | `vapor-chrome` | **浅色** | `#C4B5FD` Lilac · `#818CF8` Periwinkle (primary) · `#67E8F9` Aqua · `#A5F3FC` Ice |
| Sapphire Ice | `sapphire-ice` | **浅色** | `#102542` Sapphire · `#1E5BA8` Royal Blue (primary) · `#82B1E0` Sky · `#EAF2FB` Ice |
| Ultra Violet | `ultra-violet` | **深色** | `#5F4B8B` Ultra Violet (primary) · `#9D8DC2` Lavender · `#1B1A2E` Night Sky · `#F1ECF7` Whisper |

明暗归属的判定依据：IBM Blue / Sapphire Ice 的色板是"深文字 + 浅底"结构，Vapor Chrome 四色全是浅色 pastel，三者归浅色；Ultra Violet 含深色底 `#1B1A2E`（Night Sky）与浅色文字 `#F1ECF7`（Whisper），归深色。

**原始 4 色不足以填满 34 个变量，第 5 节已替你完成全部推导，直接复制成品 CSS 即可。**

---

## 4. 实施步骤

### 步骤 1：在 `src/renderer/themes.css` 中追加 4 个覆盖块

在 `themes.css` 中找到这一行（文件末尾的控件样式注释，约第 306 行）：

```css
/* ============ Palette picker control ============ */
```

把本文档**第 5 节的全部 CSS**（从 `/* ==== 新增浅色配色 ==== */` 到 ultra-violet 块的最后一个 `}`）**原样插入到该注释行的上方**，即：新配色块在前，Palette picker 注释及其 `.palette-select` 样式保持在文件末尾。插入后结构为：

```
...（已有 8 个配色块）
（新插入的 4 个配色块）
/* ============ Palette picker control ============ */
.palette-select { ... }（原有，不动）
```

### 步骤 2：在 `src/renderer/index.html` 下拉框中插入 4 个选项

找到第 112 行：

```html
              <option value="lilac-mist">Lilac Mist 丁香雾</option>
```

在它**之后**插入 3 行（浅色组，缩进 14 空格，与已有 option 对齐）：

```html
              <option value="ibm-blue">IBM Blue 企业蓝</option>
              <option value="vapor-chrome">Vapor Chrome 蒸汽铬</option>
              <option value="sapphire-ice">Sapphire Ice 冰晶蓝</option>
```

再找到第 116 行（插入上面的 3 行之后行号会变为 119，以内容为准）：

```html
              <option value="stripe-violet">Stripe Violet 条纹紫</option>
```

在它**之后**插入 1 行（深色组）：

```html
              <option value="ultra-violet">Ultra Violet 紫外光</option>
```

完成后 `<select>` 内应有 12 个 `<option>`，顺序为：4 个旧浅色 → 3 个新浅色 → 4 个旧深色 → 1 个新深色。

### 步骤 3：在 `src/renderer/app.js` 的 `PALETTES` 常量中插入 4 行

找到文件开头（约第 2–11 行）：

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
```

替换为（**只新增 4 行，其余原样保留**；3 个浅色条目插在 `'lilac-mist'` 行之后，1 个深色条目插在 `'stripe-violet'` 行之后）：

```js
const PALETTES = {
  'arctic-frost': { mode: 'light' },
  'cloud-saas': { mode: 'light' },
  'blush-lavender': { mode: 'light' },
  'lilac-mist': { mode: 'light' },
  'ibm-blue': { mode: 'light' },
  'vapor-chrome': { mode: 'light' },
  'sapphire-ice': { mode: 'light' },
  'github-dim': { mode: 'dark' },
  'midnight-indigo': { mode: 'dark' },
  'linear-violet': { mode: 'dark' },
  'stripe-violet': { mode: 'dark' },
  'ultra-violet': { mode: 'dark' }
};
```

**注意**：`mode` 的值决定选择该配色时界面切到浅色还是深色，写错会导致"选了浅色配色但界面是深色"。逐行核对：`ibm-blue`、`vapor-chrome`、`sapphire-ice` 是 `'light'`，`ultra-violet` 是 `'dark'`。

### 步骤 4：验证（见第 6 节，必做）

---

## 5. 新增 CSS 完整内容（步骤 1 用，整体复制到 Palette picker 注释上方）

```css
/* ==== 新增浅色配色 ==== */

:root[data-palette='ibm-blue']:not([data-theme='dark']) {
  --accent: #0f62fe;
  --accent-bright: #0043ce;
  --accent-soft: rgba(15, 98, 254, 0.1);
  --bg: #f4f4f4;
  --surface: #ffffff;
  --sidebar: transparent;
  --sidebar-border: rgba(22, 22, 22, 0.08);
  --text: #161616;
  --text-secondary: #525252;
  --text-tertiary: #8d8d8d;
  --border: #e0e0e0;
  --code-bg: #f4f4f4;
  --quote-bg: #edf5ff;
  --toolbar: rgba(244, 244, 244, 0.7);
  --editor-bg: #fafafa;
  --gutter-bg: #eaeaea;
  --syntax-text: #333a42;
  --syntax-muted: #7a828c;
  --syntax-heading: #0f62fe;
  --syntax-keyword: #b4233d;
  --syntax-string: #25664f;
  --syntax-number: #175ca3;
  --syntax-symbol: #9a6700;
  --syntax-selection: rgba(15, 98, 254, 0.2);
  --shadow: 0 22px 60px rgba(22, 22, 22, 0.12);
  --chrome-base: #eaeaea;
  --chrome-tint: rgba(234, 234, 234, 0.76);
  --glass-fill: rgba(234, 234, 234, 0.64);
  --glass-edge: rgba(255, 255, 255, 0.64);
  --glass-line: rgba(82, 82, 82, 0.13);
  --glass-shade: rgba(82, 82, 82, 0.1);
  --glass-light: rgba(255, 255, 255, 0.5);
  --relief-dark: rgba(130, 130, 130, 0.3);
  --relief-light: rgba(255, 255, 255, 0.88);
}

:root[data-palette='vapor-chrome']:not([data-theme='dark']) {
  --accent: #6366f1;
  --accent-bright: #818cf8;
  --accent-soft: rgba(129, 140, 248, 0.14);
  --bg: #f2effd;
  --surface: #ffffff;
  --sidebar: transparent;
  --sidebar-border: rgba(99, 102, 241, 0.1);
  --text: #312e4b;
  --text-secondary: #615d80;
  --text-tertiary: #9794b5;
  --border: #ddd8f3;
  --code-bg: #edebfb;
  --quote-bg: #e5f9fd;
  --toolbar: rgba(242, 239, 253, 0.7);
  --editor-bg: #f8f7fe;
  --gutter-bg: #ece9fa;
  --syntax-text: #333a42;
  --syntax-muted: #7a828c;
  --syntax-heading: #6366f1;
  --syntax-keyword: #b4233d;
  --syntax-string: #25664f;
  --syntax-number: #175ca3;
  --syntax-symbol: #9a6700;
  --syntax-selection: rgba(129, 140, 248, 0.2);
  --shadow: 0 22px 60px rgba(73, 68, 130, 0.14);
  --chrome-base: #e4e0f8;
  --chrome-tint: rgba(228, 224, 248, 0.76);
  --glass-fill: rgba(228, 224, 248, 0.64);
  --glass-edge: rgba(255, 255, 255, 0.64);
  --glass-line: rgba(97, 93, 128, 0.13);
  --glass-shade: rgba(97, 93, 128, 0.1);
  --glass-light: rgba(255, 255, 255, 0.5);
  --relief-dark: rgba(139, 134, 180, 0.3);
  --relief-light: rgba(255, 255, 255, 0.88);
}

:root[data-palette='sapphire-ice']:not([data-theme='dark']) {
  --accent: #1e5ba8;
  --accent-bright: #2e6fbd;
  --accent-soft: rgba(30, 91, 168, 0.1);
  --bg: #f0f6fd;
  --surface: #ffffff;
  --sidebar: transparent;
  --sidebar-border: rgba(16, 37, 66, 0.09);
  --text: #102542;
  --text-secondary: #405877;
  --text-tertiary: #7a93b3;
  --border: #d2e0f0;
  --code-bg: #e6eff9;
  --quote-bg: #e2edfa;
  --toolbar: rgba(234, 242, 251, 0.7);
  --editor-bg: #f5f9fe;
  --gutter-bg: #e3edf8;
  --syntax-text: #333a42;
  --syntax-muted: #7a828c;
  --syntax-heading: #1e5ba8;
  --syntax-keyword: #b4233d;
  --syntax-string: #25664f;
  --syntax-number: #175ca3;
  --syntax-symbol: #9a6700;
  --syntax-selection: rgba(30, 91, 168, 0.2);
  --shadow: 0 22px 60px rgba(16, 37, 66, 0.13);
  --chrome-base: #deebf8;
  --chrome-tint: rgba(222, 235, 248, 0.76);
  --glass-fill: rgba(222, 235, 248, 0.64);
  --glass-edge: rgba(255, 255, 255, 0.64);
  --glass-line: rgba(40, 70, 105, 0.13);
  --glass-shade: rgba(40, 70, 105, 0.1);
  --glass-light: rgba(255, 255, 255, 0.5);
  --relief-dark: rgba(110, 140, 170, 0.3);
  --relief-light: rgba(255, 255, 255, 0.88);
}

/* ==== 新增深色配色 ==== */

:root[data-theme='dark'][data-palette='ultra-violet'] {
  --accent: #8e72c9;
  --accent-bright: #a98fe0;
  --accent-soft: rgba(142, 114, 201, 0.15);
  --bg: #1b1a2e;
  --surface: #25243d;
  --sidebar: transparent;
  --sidebar-border: rgba(255, 255, 255, 0.08);
  --text: #e9e4f3;
  --text-secondary: #a49bbd;
  --text-tertiary: #6f688a;
  --border: #35334f;
  --code-bg: #211f38;
  --quote-bg: #2a2540;
  --toolbar: rgba(27, 26, 46, 0.7);
  --editor-bg: #191829;
  --gutter-bg: #211f38;
  --syntax-text: #dce2ea;
  --syntax-muted: #87919d;
  --syntax-heading: #bda7ee;
  --syntax-keyword: #ff7b72;
  --syntax-string: #8ed6b4;
  --syntax-number: #79c0ff;
  --syntax-symbol: #e3b341;
  --syntax-selection: rgba(142, 114, 201, 0.24);
  --shadow: 0 22px 60px rgba(0, 0, 0, 0.36);
  --chrome-base: #25243d;
  --chrome-tint: rgba(37, 36, 61, 0.82);
  --glass-fill: rgba(37, 36, 61, 0.68);
  --glass-edge: rgba(216, 205, 245, 0.12);
  --glass-line: rgba(185, 172, 225, 0.1);
  --glass-shade: rgba(0, 0, 0, 0.3);
  --glass-light: rgba(200, 188, 235, 0.12);
  --relief-dark: rgba(6, 5, 14, 0.5);
  --relief-light: rgba(72, 66, 108, 0.3);
}
```

**注意**：每个块都必须恰好包含 34 个变量，与已有 8 个块的变量清单一一对应。插入后对照任一已有块（如 `:root[data-palette='lilac-mist']:not([data-theme='dark'])`）核对变量名集合是否完全一致——变量名拼错不会报错，只会静默失效。

---

## 6. 验证清单（按顺序逐项执行，全部通过才算完成）

1. **数量检查**：
   ```bash
   grep -c "data-palette" src/renderer/themes.css    # 必须从 8 变为 12
   grep -c "<option value=" src/renderer/index.html  # 必须输出 12
   grep -c "mode: '" src/renderer/app.js             # PALETTES 中必须有 12 个条目（输出应 ≥ 12）
   ```
2. **JS 语法检查**：`node --check src/renderer/app.js`，必须无输出、退出码 0。
3. **单元测试**：`npm test`，必须全部通过（本次改动不涉及被测模块，失败说明改错了文件）。
4. **手动界面验证**：`npm start` 启动应用，打开 `examples/latex-showcase.md`，逐项确认：
   - [ ] 配色下拉框现在有 12 个选项，新增的 4 个是：IBM Blue 企业蓝、Vapor Chrome 蒸汽铬、Sapphire Ice 冰晶蓝（浅色组）、Ultra Violet 紫外光（深色组）
   - [ ] 选 IBM Blue / Vapor Chrome / Sapphire Ice 时界面为浅色，选 Ultra Violet 时界面为深色
   - [ ] 4 套新配色下正文、侧边栏、工具栏、编辑器行号、代码高亮均清晰可读，玻璃浮雕效果仍在
   - [ ] 选任一新配色后重启应用，配色保持
   - [ ] 点明暗切换按钮仍回到默认方案（浅色 → Arctic Frost，深色 → GitHub Dim），这是预期行为，不是 bug
   - [ ] 任一新配色下导出 PDF，PDF 仍为白底黑字
5. **任何一项不通过**：回滚对应文件后重做该步骤，不要带问题上交。

---

## 7. 常见问题（FAQ）

**Q1：选了新配色但界面没变？**
A：三种可能，按序排查：① `themes.css` 的覆盖块选择器拼错（浅色必须是 `:root[data-palette='slug']:not([data-theme='dark'])`，深色必须是 `:root[data-theme='dark'][data-palette='slug']`）；② `app.js` 的 `PALETTES` 里 slug 拼写与 CSS、`<option value>` 三处不一致（必须逐字符相同：`ibm-blue`、`vapor-chrome`、`sapphire-ice`、`ultra-violet`）；③ Electron 缓存，重启应用。

**Q2：选 Ultra Violet 界面却是浅色？**
A：`PALETTES` 中 `'ultra-violet'` 的 `mode` 写成了 `'light'`，改回 `'dark'`。

**Q3：新配色在打印/PDF 里生效了？**
A：你改到了 `styles.css` 的 `@media print` 块，或动了 `index.html` 里 `themes.css` 链接的 `media="screen"`。本次任务**不需要碰这两个文件**，回滚误改。

**Q4：`grep -c "data-palette" src/renderer/themes.css` 输出不是 12？**
A：数一下插入了几块。少块=漏复制；多块=重复插入，删掉重复的。

---

## 8. 配色映射说明（可选阅读，不需要执行）

- **IBM Blue**：遵循 IBM Carbon 设计惯例——近黑文字 `#161616` + 中性灰阶背景，`#0F62FE` 主色在白底上对比度 ≥ 4.5:1，悬停态用更深的 `#0043CE`。
- **Vapor Chrome**：四色全是 pastel，主色 `#818CF8` 在白底上太浅，强调色改用同族更深的 `#6366F1`；引用块底色 `#E5F9FD` 取 Aqua/Ice 的青色变体，保留 Y2K 气质。
- **Sapphire Ice**：底色取 Ice `#EAF2FB` 的提亮变体，文字取 Sapphire `#102542`，主色 Royal Blue `#1E5BA8` 白底对比度充足，直接用作 `--accent`。
- **Ultra Violet**：深色底取 Night Sky `#1B1A2E`，文字取 Whisper 的微调值；主色 `#5F4B8B` 在暗底上偏暗，提亮为 `#8E72C9` 保证可读。
- 语法高亮沿用既有约定：浅色方案共享 GitHub light 风格、深色方案共享 GitHub dark 风格，仅 `--syntax-heading` 与 `--syntax-selection` 跟随各方案主色。

数据来源：[zeeklog.com UI配色美学](https://zeeklog.com/ui-color-aesthetics)（色值已按页面内嵌数据逐一核对）。
