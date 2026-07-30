# Formula MD

Formula MD 是一个面向 macOS 和 Windows 的离线 Markdown + LaTeX 阅读器。它使用 MathJax 排版数学公式，并在 Markdown 解析前保护公式源码，避免下划线、星号和反斜杠被 Markdown 语法提前改写。

## 功能

- 支持 `$...$`、`$$...$$`、`\\(...\\)`、`\\[...\\]` 和 AMS 环境
- 支持公式编号、`\\label` / `\\eqref`、矩阵、自定义宏、物理和化学扩展
- 完全离线的 Markdown、代码高亮与数学排版
- 打开、拖放、最近文档、目录导航、全文搜索、深浅主题
- 浏览器式多标签页，可同时打开、切换和关闭多份文档
- 每个标签独立记忆阅读位置、编辑位置与光标，会话重启后自动恢复
- 阅读/编辑模式切换，左侧 Markdown 与围栏代码语法高亮、右侧 LaTeX 实时预览
- 行号、光标位置、`Command/Ctrl-S` 保存与未保存关闭保护
- 将当前排版后的正文保存为带页码的 A4 PDF
- 监听源文件变化并自动重新排版
- 文档内容经过清理，渲染进程与系统文件能力隔离

## 开发运行

需要 Node.js 20 或更高版本。

```bash
npm install
npm start
```

可以直接打开样例文件 `examples/latex-showcase.md` 检查公式支持。

## 测试与构建

```bash
npm test
npm run pack  # 生成未封装的 .app
npm run dist  # 生成 DMG 和 ZIP
npm run pack:win  # 生成 Windows x64 未封装目录
npm run dist:win  # 生成 Windows x64 安装程序
```

构建产物位于 `dist/`。macOS 构建未签名时适合本机使用；公开分发时需要配置 Apple Developer ID 签名与公证。Windows 安装程序未进行代码签名，首次运行时可能触发 Microsoft Defender SmartScreen 提示。

## 支持范围

MathJax 实现的是 LaTeX 数学模式及常用扩展，不是完整的 TeX 文档引擎。因此它不会执行 `\\documentclass`、读写本地文件、运行任意 TeX 宏包或排版整篇 `.tex` 文档。这一限制让阅读器可以安全、快速地显示 Markdown 中的数学内容。
