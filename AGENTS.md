# AGENTS.md

本文件供 AI 编程代理阅读，假设读者对本项目一无所知。

## 项目概览

Formula MD 是一个面向 macOS 和 Windows 的**离线** Markdown + LaTeX 阅读器/编辑器（Electron 应用，版本 2.0.0）。核心能力：用 MathJax 排版数学公式，并在 Markdown 解析前保护公式源码，避免下划线、星号和反斜杠被 Markdown 语法提前改写。

主要功能：

- 支持 `$...$`、`$$...$$`、`\\(...\\)`、`\\[...\\]` 和 AMS 环境；支持公式编号、`\\label` / `\\eqref`、矩阵、自定义宏、物理和化学扩展
- 浏览器式多标签页，每个标签独立记忆阅读位置、编辑位置与光标，会话重启后自动恢复
- 阅读/编辑模式切换，Markdown 源码与围栏代码语法高亮，行号、光标位置显示，`Cmd/Ctrl+S` 保存与未保存关闭保护
- 将排版后的正文导出为带页码的 A4 PDF
- 监听源文件变化并自动重新排版
- 打开、拖放、最近文档（最多 8 条）、目录导航、全文搜索、深浅主题

## 技术栈与运行要求

- Electron 44.4.5（主进程 + 沙箱化渲染进程），无前端框架，纯 HTML/CSS/原生 JS
- 运行时依赖：`markdown-it`（Markdown 解析）、`mathjax` 3.2.2（`tex-chtml-full` 组件）、`dompurify`（HTML 清理）、`@highlightjs/cdn-assets`（代码高亮），全部从本地 `node_modules` 加载，完全离线
- 开发依赖：`electron-builder`（打包）
- 需要 **Node.js 24（最低 22.12）**
- 包管理器使用 **pnpm**（存在 `pnpm-workspace.yaml` 和 `pnpm-lock.yaml`），其中 `allowBuilds` 允许 `electron`、`electron-winstaller` 执行安装脚本

## 构建与测试命令

```bash
npm install
npm start          # electron . 开发运行
npm test           # node --test tests/*.test.mjs
npm run pack       # macOS：生成未封装的 .app 目录
npm run dist       # macOS：生成 DMG 和 ZIP
npm run pack:win   # Windows x64 未封装目录
npm run dist:win   # Windows x64 NSIS 安装程序
```

构建产物位于 `dist/`。electron-builder 配置内嵌在 `package.json` 的 `build` 字段中：appId 为 `com.formulamd.reader`，产物命名 `Formula-MD-${version}-${arch}.${ext}`（NSIS 为 `Formula-MD-Setup-${version}-${arch}.${ext}`），打包应用源码范围为 `src/**/*` 和 `package.json`（运行时依赖由打包器收集），原生 `.node` 必须 unpack。2.0.0 经用户明确授权沿用未进行 Developer ID 签名与公证的发布方式；Windows 安装程序未签名。Release 必须准确注明签名状态。后续签名发布需配置相应证书与公证。图标资源在 `build/` 目录。应用注册了 `.md`、`.markdown`、`.mdown`、`.mkd` 文件关联。

## 目录结构与模块划分

```
src/
  main.js       # Electron 主进程：窗口、菜单、文件读写、文件监听、PDF 导出、IPC
  preload.js    # contextBridge，向渲染进程暴露 window.formulaMD API
  renderer/
    index.html                     # 页面结构 + CSP 头；按顺序加载依赖与本地脚本
    app.js                         # 渲染进程主逻辑：标签页管理、渲染管线、编辑器、搜索、大纲、主题、会话持久化
    math-protector.js              # 公式保护：把数学源码替换为占位符，解析后还原
    markdown-source-highlighter.js # 编辑器面板中 Markdown 源码的语法高亮
    editor-state.js                # 视图位置恢复与保存文档状态对账的纯函数
    mathjax-config.js              # window.MathJax 配置（tex 宏包、分隔符、CHTML 选项）
    styles.css                     # 基础布局、正文、编辑器与打印样式
    glass.css                      # 仅屏幕加载的新拟物玻璃材质与响应式布局，不参与 PDF
    glass-effects.js               # 控件玻璃形变与共用光斑，只在输入后请求动画帧
tests/            # node:test 单元测试（.test.mjs）
examples/latex-showcase.md  # 公式支持演示文件
build/            # 应用图标资源
dist/             # 打包产物
```

### 主进程（`src/main.js`）

- 单窗口应用；启动时 `app.setName('Formula MD')`，避免开发期共享 user-data 目录
- 只允许打开/保存 `.md`、`.markdown`、`.mdown`、`.mkd`、`.txt`，单文件上限 **20 MB**
- `fs.watch` 监听打开的文档（180 ms 防抖），保存时通过 `ignoreWatchUntil` 抑制 1200 ms 自触发
- PDF 导出用 `webContents.printToPDF`（A4、页眉页脚、页码），文件名做非法字符清洗
- 应用菜单（中文）在主进程构建；最近文件存 `userData/recent-files.json`，上限 8 条
- 未保存更改时拦截窗口关闭，弹出「保存 / 不保存 / 取消」
- 支持 macOS `open-file` 事件和命令行参数打开文档

### 预加载（`src/preload.js`）

只通过 `contextBridge` 暴露 `window.formulaMD`：文件读写、PDF 导出、最近文件、外部链接打开，以及 `document:opened`、`document:changed`、`view:*`、`editor:*` 等事件订阅。新增 IPC 通道时需同时改 `main.js`、`preload.js` 和 `app.js` 三处。

### 渲染管线（`src/renderer/app.js`）

每次渲染的顺序是固定的，不要改动：

1. `MathProtector.protectMath(content)` —— 把数学公式替换为 `FORMULAMDPROTECTEDMATH<i>ENDTOKEN` 占位符（跳过代码围栏和行内代码）
2. `markdown-it` 渲染（开启 `html`、`linkify`、`typographer`，highlight 回调走 highlight.js；`link_open` 规则强制 `target="_blank" rel="noopener noreferrer"`）
3. `DOMPurify.sanitize`（`USE_PROFILES: { html: true }`，额外放行 `target`、`rel`、`class`）
4. `MathProtector.restoreMath` 把公式放回（HTML 转义后），写入 `#article`
5. `MathJax.texReset()` + `typesetPromise` 排版公式

渲染用 `state.renderId` 防止过期结果覆盖新内容。

### 可测试模块的 UMD 模式

`math-protector.js`、`markdown-source-highlighter.js`、`editor-state.js` 三个文件使用相同的 UMD 包装（同时挂到 `window.Xxx` 和 `module.exports`），以便既能在浏览器中作为全局脚本加载，又能被 Node 测试 `require`。新写的可独立测试逻辑应沿用这一模式。

## 代码风格约定

- 纯 CommonJS / 浏览器全局脚本，无构建步骤、无 TypeScript、无 ESLint/Prettier 配置
- 缩进 2 空格，单引号，语句结尾加分号
- 命名：函数和变量用 camelCase；DOM 元素集中在 `app.js` 顶部的 `elements` 对象中登记
- 面向用户的字符串（菜单、对话框、状态栏）一律使用简体中文；代码注释目前以英文为主
- 状态集中在 `app.js` 顶部的 `state` 对象；会话持久化用 `localStorage`（键前缀 `formula-md-`）；外观及网络图片设置以主进程原子写入的 `settings.json` 为准

## 测试说明

- 测试框架是 Node 内置的 `node:test` + `assert/strict`，运行 `npm test`（即 `node --test tests/*.test.mjs`）
- 测试文件为 ESM（`.mjs`），通过 `createRequire` 加载被测的 UMD 模块
- 纯函数测试覆盖公式保护、高亮、编辑状态、滚动同步、图片资源、外观设置和异步插入位置；`test:appearance` 覆盖真实主进程、预加载和渲染进程流程
- 修改 `math-protector.js` 等被测模块后务必跑 `npm test`；新纯函数逻辑建议补对应测试
- 修改玻璃界面可运行 `pnpm test:appearance`，用隔离会话检查真实 macOS Electron 窗口；`pnpm bench:appearance` 记录短时性能样本，产物位于 `dist/glass-qa/`
- 验证公式渲染效果可打开 `examples/latex-showcase.md` 手动检查

## 安全注意事项

- 渲染进程 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`；`index.html` 设置了严格 CSP（`default-src 'self'`、`connect-src 'none'` 等），修改资源加载方式时不要放宽 CSP
- 所有文档 HTML 必须经 DOMPurify 清理后才能写入 DOM
- 外部链接只允许 `http:`、`https:`、`mailto:`（`isSafeExternalUrl`），一律 `shell.openExternal`，窗口打开处理器统一 `deny`
- 主进程限制文件扩展名和 20 MB 大小上限；PDF 页眉中的文档标题经过 HTML 转义

## 功能边界

MathJax 实现的是 LaTeX 数学模式及常用扩展，不是完整的 TeX 文档引擎。不会执行 `\\documentclass`、读写本地文件、运行任意 TeX 宏包或排版整篇 `.tex` 文档——这是设计上的限制，不要试图绕过。


## 2.0.0 图片与原生界面

- `src/images.js`：图片路径、20 MB 限额、格式检查、受控资源协议、网络取消和 `<文档名>.assets/` 导入。网络图片默认关闭，无浏览器 Cookie；15 秒超时，最多 5 次重定向。
- `src/shared/appearance-settings.js`：12 套配色、版本迁移、合法设置更新和每个预设的颜色覆盖；UMD，供主进程、渲染进程和测试共同使用。
- `src/shared/insertion-anchor.js`：异步图片插入期间的选区跟踪。不得覆盖用户在等待期间新输入的内容或插入另一标签。
- `src/renderer/image-ui.js` / `appearance-ui.js`：图片操作和共享外观状态。先在惰性 template 中处理清理后的图片地址，再写入正文；PDF 必须等待图片任务完成。
- `native/bridge.mm`：仅主进程加载的 Node-API / Objective-C++ 桥接，使用公共 NSToolbar、NSBezelStyleGlass、NSPanel、NSSlider、NSColorWell；禁止私有 API。`scripts/build-native.cjs` 使用 Xcode 26+ 编译到 `src/native/formula-md-native.node`。
- macOS 最低 13；仅 26+ 激活 AppKit 新控件。较早系统和 Windows 保留网页兼容界面。`FORMULA_MD_DISABLE_NATIVE=1` 用于验证回退。
- 透明度仅影响外围背景，正文和编辑区必须不透明。自定义颜色写入 screen-only 样式元素，避免内联根变量污染 PDF。
- 新增图片协议仅列入 CSP 的 `img-src`，移除宽泛的 `file:`；保持 `connect-src 'none'`、沙箱和 DOMPurify。
- `pnpm test:appearance` 运行 `tests/appearance-v2.cjs`；原生能力可用却回退视为失败。整窗视觉检查需包含 AppKit 工具栏，`capturePage` 仅覆盖网页内容。
- CI 验证 macOS 26、macOS 15（使用 Xcode 26 SDK）和 Windows x64。产物发布前比对远端资产 SHA-256；Release 草稿资产齐全且验证通过后再发布。
