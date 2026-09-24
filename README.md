# Formula MD 2.0.0

Formula MD 是面向 macOS 和 Windows 的 Markdown + LaTeX 阅读器／编辑器。Markdown、代码高亮和 MathJax 数学排版全部在本机完成；网络图片默认关闭，可在设置中单独开启。

## 功能

- 支持 `$...$`、`$$...$$`、`\\(...\\)`、`\\[...\\]` 和 AMS 环境，以及公式编号、引用、矩阵、自定义宏、物理与化学扩展。
- 多标签阅读和编辑，各标签记忆阅读位置、光标和编辑位置；支持会话恢复、源文件监视、目录、搜索及双向滚动同步。
- 显示本地、内嵌及可选网络图片，支持选择文件、拖入和粘贴图片，导入时自动生成可移植的相对路径。
- macOS 26+ 的主工具栏使用真正的 AppKit Liquid Glass 按钮、分段控件和搜索框，外观设置使用原生窗口与系统控件。
- 保留 12 套配色，分别记住浅色和深色选择，可自定义强调色、界面底色、正文底色、文字颜色。
- 可调整外围背景透明度，正文、编辑区、公式、文字和图片保持不透明；支持系统减少透明度、减少动态效果和增强对比度。
- 支持未保存关闭保护，以及包含图片和公式、带页码的 A4 PDF 导出。

## 图片

相对路径以 Markdown 文件的目录为基准。例如：

```markdown
![实验装置](<images/实验装置.png>)
![实验结果][result]

[result]: <实验记录.assets/结果.png>
```

同时支持本地绝对路径、`file:` 地址、内嵌 `data:image/...` 和清理后的 HTML `<img>`。格式包括 PNG、JPEG、GIF、WebP、BMP、AVIF 和 SVG，每张图片上限 20 MB。SVG 以图片方式显示，不执行脚本或嵌入 HTML。

打开文档后，用工具栏或「编辑 → 插入图片…」（`Cmd/Ctrl+Shift+I`）选择图片，也可以将图片拖入窗口或粘贴剪贴板图片。导入内容复制到 `<文档名>.assets/`，文件名包含内容摘要；同名源文件不会互相覆盖。将 Markdown 和对应资源目录一起移动即可保留图片引用。阅读模式插入图片会进入编辑模式。

「外观与图片设置」中的网络开关默认关闭。开启后仅下载 HTTP／HTTPS 图片，不使用浏览器登录凭据；请求有 15 秒超时、20 MB 上限和 5 次重定向限制。关闭开关会取消加载。缺失、损坏或被禁用的图片显示说明；导出 PDF 等待图片完成处理，失败项保留占位说明。

可打开 `examples/images-showcase.md` 和 `examples/latex-showcase.md` 查看示例。

## 外观设置

通过工具栏设置按钮或 `Cmd/Ctrl+,` 打开设置：

- 显示模式：跟随系统、浅色、深色。两种明暗模式分别记住最近使用的预设。
- 配色：保留 12 套预设；四项自定义颜色按预设保存，可恢复当前预设的颜色。
- 背景透明度：0–100%，默认 20%；仅调整外围背景的色彩遮罩。Apple 原生控件的玻璃折射、模糊和最终透明度由系统管理。
- 网络图片：默认关闭，开启后对当前及后续打开的文档生效。

设置由主进程原子写入用户数据目录的 `settings.json`，升级时迁移既有配色与旧存储值。屏幕配色和玻璃效果不会进入 PDF，打印保持不透明白底与固定配色。

## 平台与构建

- macOS 13+；macOS 26+ 使用原生 Liquid Glass，13–15 使用兼容界面。发布包为 Apple Silicon arm64。
- Windows x64 使用相同的图片、编辑和设置能力，以及兼容控件；Windows 11 22H2+ 可使用系统背景材质，较早系统使用兼容背景。
- Node.js 24（最低 22.12）、pnpm 11.17.0、Electron 44.4.5。macOS 构建还需要 Xcode 26+ 和 macOS 26 SDK。

```bash
pnpm install --frozen-lockfile
pnpm start                    # 编译 macOS 桥接并启动
pnpm test                     # 纯逻辑测试
pnpm test:appearance           # 隔离会话的真实 Electron 功能检查
pnpm bench:appearance         # 长公式文档的短时性能样本
pnpm run pack                 # macOS .app
pnpm run dist --publish never # macOS DMG + ZIP
pnpm run pack:win             # Windows x64 未封装目录
pnpm run dist:win --publish never
```

原生代码只使用 Node-API 和公共 AppKit API，编译结果位于 `src/native/` 并由打包器放入 `app.asar.unpacked`。Windows 无需编译或加载该模块。`FORMULA_MD_DISABLE_NATIVE=1` 可在开发检查中强制验证兼容界面。

界面检查的报告、截图和 PDF 位于 `dist/qa-v2/`；性能样本位于 `dist/glass-qa/`。检查不使用真实用户会话，CI 覆盖 macOS 26、macOS 15 和 Windows x64。性能数据仅代表所用机器和短时样本。

2.0.0 沿用未进行 Developer ID 签名／公证、未进行 Windows 代码签名的发布方式，首次运行可能出现系统提示。Release 同时提供安装包、blockmap 和 SHA-256 校验清单。

## 实现边界

所有文档 HTML 经 DOMPurify 清理。图片通过主进程受控协议提供，保留严格 CSP、渲染进程沙箱和上下文隔离。网络图片开关不会向正文脚本提供网络访问能力。

MathJax 实现的是 LaTeX 数学模式及常用扩展，并非完整的 TeX 文档引擎。不会执行 `\\documentclass`、读写本地文件或运行任意 TeX 宏包。
