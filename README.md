# CodeGraph：Fortran 扩展版

本项目基于 [Colby Mchenry 及贡献者维护的 CodeGraph](https://github.com/colbymchenry/codegraph)，保留其多语言代码索引、CLI 和 MCP 能力，并增加 Fortran 语法、符号提取、调用关系解析及验证样例。适用于 Fortran、Python、C++ 及混合语言项目。

本仓库由 [shiysent-ctrl](https://github.com/shiysent-ctrl) 独立维护扩展和发行。上游提供了本项目的代码图谱架构、索引与查询实现、命令行及 MCP 基础，感谢原作者和所有贡献者；Fortran 语法也依赖社区维护的 tree-sitter 项目。来源和许可证见下文。

## 先确认你使用的是哪个版本

截至 **2026-10-02**，标准命令兼容修改已合并到 `main`，尚未发布为新的安装包。

| 获取方式 | CLI 入口 | 默认项目索引 | MCP 配置名 |
| --- | --- | --- | --- |
| 从当前 `main` 构建 | `codegraph`（Windows 启动器为 `codegraph.cmd`） | `.codegraph` | `codegraph` |
| 已发布的 `v1.6.1-fortran.2` 预览包 | `codegraph-fortran.cmd` | `.codegraph-fortran` | `codegraph-fortran` |

[已发布的预览包](https://github.com/shiysent-ctrl/codegraph-fortran/releases/tag/v1.6.1-fortran.2) 保持原样，它与当前源码的入口约定不同。包版本仍为 `1.6.1-fortran.2`，因此识别本次构建还应查看 `fortran-release.json` 中的 `cliName: "codegraph"`、`indexDirectory: ".codegraph"` 和源码提交信息。

**要使用标准 `codegraph` 入口，请按下面的源码构建流程操作。** 已有可用环境时，先用独立二进制目录和临时项目验证，再决定是否切换。构建本身不会安装新版、修改 PATH 或切换客户端。

## 相对上游增加了什么

- Fortran 文件识别和 tree-sitter WASM 语法加载。
- 模块、子模块、程序、函数、子程序、内部过程、派生类型、常量和接口等符号提取。
- USE 导入及直接调用关系，名称按 Fortran 规则归一为小写，同时保留原源码和过程范围。
- 固定格式首列 `C/c/*` 注释的等长解析处理，以及 CRLF、大写扩展名和混合语言验收样例。

标准入口保留 `codegraph init`、`codegraph index`、`codegraph status`、`codegraph serve --mcp` 等命令；所有支持的语言默认使用 `.codegraph`。`CODEGRAPH_DIR` 可按上游规则显式覆盖，目录和命令不随项目语言改变。

## 获取并构建标准入口

当前发行构建和验收范围为 **Windows x64**。源码构建请使用 Git、Node.js **24.x**（CI 使用 `24.16.0`）和 npm；运行随包二进制使用自带 Node，无需 Fortran 编译器。

在 PowerShell 中选择一个新的工作目录：

```powershell
git clone https://github.com/shiysent-ctrl/codegraph-fortran.git
Set-Location .\codegraph-fortran
npm ci
npm run build
```

可运行与本扩展相关的回归测试：

```powershell
npx vitest run __tests__/fortran.test.ts __tests__/extraction.test.ts __tests__/grammar-wasm-bytes.test.ts __tests__/preload-languages.test.ts __tests__/cross-language-resolution.test.ts
```

随后下载固定的上游平台包并构建本 fork 的 ZIP：

```powershell
npm pack @colbymchenry/codegraph-win32-x64@1.6.1 --pack-destination .
node scripts/fortran/build-release.cjs --archive .\colbymchenry-codegraph-win32-x64-1.6.1.tgz --output .\release\standard-preview
```

平台包用于复用 Node 和生产依赖；构建脚本先验证其固定 SHA-512，应用代码、提取器和语法来自本 fork 的构建结果。输出目录包含 `codegraph-fortran-win32-x64.zip`、`SHA256SUMS` 和 `install.ps1`。资产文件名中的 Fortran 用于标识发行来源，包内启动器为 `bin/codegraph.cmd`。若输出 ZIP 已存在，请选择新的输出目录，脚本会拒绝静默覆盖。

这一步会在临时混合项目运行 CLI/MCP 验收，并将源码、依赖和语法来源记录保存到包内的 `fortran-release.json`，将验收结果保存为 `verification.json`。

## 选择安装位置并运行

准备好切换或测试本次构建时，使用同一构建的 ZIP、校验文件和安装脚本，选择一个不存在的目标目录：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\release\standard-preview\install.ps1 -Archive .\release\standard-preview\codegraph-fortran-win32-x64.zip -ChecksumFile .\release\standard-preview\SHA256SUMS -Destination "$env:LOCALAPPDATA\CodeGraphPreview\standard-cli"
```

安装脚本校验文件和 CLI/MCP 行为后生成配置片段。它不会修改全局 CodeGraph、PATH 或客户端，也不会初始化研究项目。现有目标目录不会被覆盖；`ExecutionPolicy Bypass` 只作用于本次进程。

使用选定二进制的完整路径，避免调用到 PATH 中的其他版本。请将项目路径替换为你明确选择的测试项目：

```powershell
$taskCodeGraph = "$env:LOCALAPPDATA\CodeGraphPreview\standard-cli\bin\codegraph.cmd"
& $taskCodeGraph --version
& $taskCodeGraph init "D:\Research\MixedProject" --yes
Set-Location "D:\Research\MixedProject"
& $taskCodeGraph index
& $taskCodeGraph status
```

将所选版本的 `bin` 目录配置到 PATH 后，可以直接使用 `codegraph`。默认索引目录是项目中的 `.codegraph`；将来切换已有项目时，应停止旧版写入并使用所选新版重建索引。

### 接入 MCP

安装目录生成 `mcp-config.json` 和 `codex-mcp.toml`。选择客户端支持的格式，将其中的 `codegraph` 配置加入客户端；已有同名条目时替换对应条目，重启 MCP 会话，并在查询中明确指定项目路径。

配置使用包内 Node 和 CLI，不强制设置 `CODEGRAPH_DIR`。本预览包禁用共享守护进程。同一个项目索引应避免由不同版本同时写入。

### 升级渠道

本 fork 的安装和升级使用对应的源码构建或 fork Release 资产。继承的 `codegraph install`、`codegraph upgrade`、`codegraph uninstall` 仍沿用上游安装渠道，不能用于安装或升级本 fork 的发行包。上游 npm 包和上游安装脚本也不能代替本仓库的 Fortran 扩展构建。

## 已验证范围与限制

[标准命令修改的 Windows CI](https://github.com/shiysent-ctrl/codegraph-fortran/actions/runs/36985282479) 已通过构建、相关回归测试、混合项目 CLI/MCP 验收，以及 PowerShell 7 和 Windows PowerShell 5.1 的临时离线安装验收。相关回归测试共 725 项，其中 22 项针对 Fortran；混合验收覆盖 7 文件、31 节点、34 条边。实际客户端配置切换仍需在各用户环境验证。

当前 Windows x64 发行包使用 WASM 提取路径，**未包含上游 Rust 原生内核**。本 README 的验证结果只对应本 fork；上游的性能基准、多平台支持及其他发行承诺请查阅其官方说明。

Fortran 支持 `.f`、`.f90`、`.f95`、`.f03`、`.f08`、`.for`、`.ftn`、`.fpp` 及大写扩展名。固定格式续行和列宽、USE 重命名、复杂泛型接口、过程指针、动态分派、函数与数组下标歧义及宏展开仍有边界。Linux/macOS/ARM、完整 RHF 工程、完整 Fortran 标准及代理 A/B 性能尚未验证。代码图谱用于辅助源码阅读，其静态关系不等于编译器语义或数值正确性验证。

## 来源、致谢与许可证

本仓库主体代码沿用 **MIT 许可证**，原作者的版权声明和许可文本保留在 [LICENSE](LICENSE)。修改和再分发时，应保留适用的版权、许可及第三方声明；MIT 允许修改和分发，具体条件以完整 [MIT 许可文本](https://opensource.org/license/mit) 为准。

| 组件 | 来源与致谢 | 随仓库保存的声明 |
| --- | --- | --- |
| CodeGraph 基础实现 | [Colby Mchenry 及 CodeGraph 贡献者](https://github.com/colbymchenry/codegraph) | [MIT 许可证及原版权声明](LICENSE) |
| Fortran tree-sitter 语法 | [stadelmanma/tree-sitter-fortran](https://github.com/stadelmanma/tree-sitter-fortran)，感谢该项目维护者和贡献者 | [语法许可证](third_party/fortran/LICENSE)、[固定源码与构建记录](third_party/fortran/manifest.json) |
| 随包 Node.js 与相关组件 | [Node.js 项目及贡献者](https://nodejs.org/)；运行时从固定上游平台包复用 | [运行时许可汇总](third_party/node/LICENSE) |

生产依赖的许可文件随发行包保留，相关版本由 [package-lock.json](package-lock.json) 记录。第三方组件遵循各自许可；根目录的 MIT 声明不替代这些条款。本 fork 的扩展不改变原作者对其作品的权利，项目名称和来源链接用于说明技术来源，本仓库的修改、支持和发行由本 fork 维护者负责。

## 维护与反馈

使用问题和扩展建议请提交到 [本 fork 的 Issues](https://github.com/shiysent-ctrl/codegraph-fortran/issues)。提取器、语法、测试和发行脚本以本仓库为唯一维护源；向上游贡献修改时，另行向上游提交 PR。

更详细的适配边界、构建和维护说明见 [FORTRAN.md](FORTRAN.md)。新版本发布通过 [Fortran Windows 工作流](.github/workflows/fortran-windows.yml) 执行，已发布版本和资产保持原样；新的命令兼容修改需要选择新版本后再发布。
