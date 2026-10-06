# Formula MD 2.2.0

Formula MD 是面向 macOS 和 Windows 的 Markdown + LaTeX 阅读器／编辑器。Markdown、代码高亮和 MathJax 数学排版全部在本机完成；网络图片默认关闭，可在设置中单独开启。

## 2.2.0 更新

- macOS 26+ 使用整窗 clear 玻璃与轻量磨砂层，最高透明度能够更明显地透出窗口后方颜色。
- 正文和编辑区共享一层轻度磨砂背景；文字、公式和图片保持清晰，PDF 保持白底。
- 侧栏增加圆角玻璃面板、细亮边与随指针移动的光晕；标签切换时选中层拉伸、滑动并回弹，静止阅读时停止动效。
- 改善深色模式的文字对比度，保留 12 套配色、自定义颜色、已有透明度设置与系统辅助功能回退。
- 修复 macOS 标题栏空白处双击缩放，遵循系统的最大化、最小化或不执行操作设置，工具栏按钮与正文点击不受影响。
- 提供 macOS Apple Silicon 的 DMG／ZIP，以及 Windows x64 安装程序、对应 blockmap 和 SHA-256 校验清单。

## 功能

- 支持 `$...$`、`$$...$$`、`\\(...\\)`、`\\[...\\]` 和 AMS 环境，以及公式编号、引用、矩阵、自定义宏、物理与化学扩展。
- 多标签阅读和编辑，各标签记忆阅读位置、光标和编辑位置；支持会话恢复、源文件监视、目录、搜索及双向滚动同步。
- 显示本地、内嵌及可选网络图片，支持选择文件、拖入和粘贴图片，导入时自动生成可移植的相对路径。
- macOS 26+ 的主工具栏使用真正的 AppKit Liquid Glass 按钮、分段控件和搜索框，外观设置使用原生窗口与系统控件。
- 保留 12 套配色，分别记住浅色和深色选择，可自定义强调色、界面底色、正文底色、文字颜色。
- 可调整玻璃背景透明度；最高透明度时正文与编辑区轻度磨砂透色，公式、文字和图片保持清晰；支持系统减少透明度、减少动态效果和增强对比度。
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
- 背景透明度：0–100%，默认 20%；同时调节外围玻璃与正文面板。100% 时外围使用清透材质，正文和编辑区保留轻度磨砂底色；0% 时背景恢复不透明。文字、公式和图片不随滑块淡化。Apple 原生玻璃的折射与模糊由系统管理。
- 网络图片：默认关闭，开启后对当前及后续打开的文档生效。

设置由主进程原子写入用户数据目录的 `settings.json`，升级时迁移既有配色与旧存储值。屏幕配色和玻璃效果不会进入 PDF，打印保持不透明白底与固定配色。

## 平台与构建

- macOS 13+；macOS 26+ 使用原生 Liquid Glass，13–15 使用兼容界面。macOS 发布包为 Apple Silicon arm64。
- Windows x64 使用相同的图片、编辑和设置能力，以及兼容控件；Windows 11 22H2+ 可使用系统背景材质，较早系统使用兼容背景。
- Node.js 24（最低 22.12）、pnpm 11.17.0、Electron 44.4.5。macOS 构建还需要 Xcode 26+ 和 macOS 26 SDK。

```bash
pnpm install --frozen-lockfile
pnpm start                    # 编译 macOS 桥接并启动
pnpm test                     # 纯逻辑测试
pnpm test:appearance           # 隔离会话的真实 Electron 功能检查
pnpm bench:appearance         # 长公式文档的短时性能样本
pnpm preview:glass            # 独立数据目录的 macOS 玻璃预览，可与已安装应用并行
FORMULA_MD_GLASS_TRANSPARENCY=100 pnpm preview:glass # 仅将预览的透明度设为最高
pnpm run pack                 # macOS .app
pnpm run dist --publish never # macOS DMG + ZIP
pnpm run pack:win             # Windows x64 未封装目录
pnpm run dist:win --publish never
```

原生代码只使用 Node-API 和公共 AppKit API，编译结果位于 `src/native/` 并由打包器放入 `app.asar.unpacked`。Windows 无需编译或加载该模块。`FORMULA_MD_DISABLE_NATIVE=1` 可在开发检查中强制验证兼容界面。

macOS 原生界面使用三个 clear 玻璃按钮组，标签、目录及最近文档提供随输入触发的流光与弹性反馈。macOS 27 且使用相应 SDK 构建时启用原生玻璃交互；较早系统保留可用的系统控件。减少动态效果、减少透明度和提高对比度会关闭相应效果。正文与编辑区共享一层磨砂底色；侧栏流光随指针移动，标签选中层在切换时拉伸回弹，静止阅读时不运行持续动效。PDF 始终保持白底。

`preview:glass` 只复制外观设置和示例文档到临时预览目录，不读取已有文档会话，不修改已安装应用或原始示例。预览窗口标题带有“玻璃预览”，关闭窗口即可退出；目录保留以便复核设置。

界面检查的报告、截图和 PDF 位于 `dist/qa-v2/`；性能样本位于 `dist/glass-qa/`。检查不使用真实用户会话，CI 覆盖 macOS 26、macOS 15 和 Windows x64。性能数据仅代表所用机器和短时样本。

2.2.0 的 macOS 发布包沿用未进行 Developer ID 签名与公证的方式，首次运行可能出现系统提示。Release 同时提供安装包、blockmap 和 SHA-256 校验清单。

## 实现边界

所有文档 HTML 经 DOMPurify 清理。图片通过主进程受控协议提供，保留严格 CSP、渲染进程沙箱和上下文隔离。网络图片开关不会向正文脚本提供网络访问能力。

MathJax 实现的是 LaTeX 数学模式及常用扩展，并非完整的 TeX 文档引擎。不会执行 `\\documentclass`、读写本地文件或运行任意 TeX 宏包。
