# CodeGraph：Fortran 扩展版

本项目基于 [Colby Mchenry 及贡献者维护的 CodeGraph](https://github.com/colbymchenry/codegraph)，保留其多语言代码索引、CLI 和 MCP 能力，并增加 Fortran 支持。Fortran、Python、C++ 及混合语言项目都使用同一个 `codegraph` 命令和 `.codegraph` 项目索引。

本 fork 由 [shiysent-ctrl](https://github.com/shiysent-ctrl) 独立维护。感谢上游作者、贡献者，以及 tree-sitter-fortran 和 Node.js 社区。版权、许可证和第三方声明见文末。

## 下载与安装

当前发行：**[v1.6.1-fortran 多平台预览版](https://github.com/shiysent-ctrl/codegraph-fortran/releases/tag/v1.6.1-fortran)**。在 Release 页面展开 **Assets** 下载；仓库中的安装脚本负责下载和校验二进制包，脚本本身不包含程序。运行发行包无需另外安装 Node.js、npm 或 Fortran 编译器。

| 系统 | 对应安装包 | 安装脚本 |
| --- | --- | --- |
| Windows x64 | codegraph-fortran-win32-x64.zip | install.ps1 |
| Linux x64（glibc） | codegraph-fortran-linux-x64.tar.gz | install.sh |
| Linux ARM64（glibc） | codegraph-fortran-linux-arm64.tar.gz | install.sh |
| macOS Intel | codegraph-fortran-darwin-x64.tar.gz | install.sh |
| macOS Apple Silicon | codegraph-fortran-darwin-arm64.tar.gz | install.sh |

Release 还提供统一的 SHA256SUMS。Windows ARM64 和 Alpine/musl 不在本版支持范围。

### Windows

从上述 Release 下载 install.ps1，在下载目录打开 PowerShell，执行：

~~~powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
~~~

默认安装到 %LOCALAPPDATA%\codegraph\current，并把其中的 bin 目录加入用户 PATH。**重新打开终端**后确认：

~~~powershell
codegraph --version
Get-Command codegraph -All
~~~

版本应为 1.6.1-fortran。如果调用到旧 npm 安装或其他目录中的程序，调整 PATH 顺序后再次确认。安装器允许替换标准位置中可识别的 CodeGraph 程序目录；它不初始化项目，也不自动修改客户端配置。

### Linux 与 macOS

下载对应 Release 的 install.sh，或执行以下命令下载到当前目录，再运行：

~~~sh
curl -fL https://github.com/shiysent-ctrl/codegraph-fortran/releases/download/v1.6.1-fortran/install.sh -o install.sh
CODEGRAPH_VERSION=v1.6.1-fortran sh ./install.sh
export PATH="$HOME/.local/bin:$PATH"
codegraph --version
command -v codegraph
~~~

安装器自动选择当前系统和架构。默认程序位于 ~/.codegraph/versions/v1.6.1-fortran，~/.codegraph/current 指向当前版本，全局命令为 ~/.local/bin/codegraph。这些目录与上游独立安装器一致。将上面的 PATH 设置写入所用 shell 的配置（例如 ~/.bashrc 或 ~/.zshrc），重新打开终端，并让 MCP 客户端继承该 PATH。

### 离线安装与自选目录

下载**同一 Release** 的安装脚本、对应平台安装包和 SHA256SUMS，放在同一目录。Windows 执行：

~~~powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Archive .\codegraph-fortran-win32-x64.zip -ChecksumFile .\SHA256SUMS
~~~

Linux/macOS 执行，按实际平台替换安装包名：

~~~sh
CODEGRAPH_VERSION=v1.6.1-fortran sh ./install.sh \
  --archive ./codegraph-fortran-linux-x64.tar.gz \
  --checksum-file ./SHA256SUMS
~~~

Windows 可用 -Destination 自选程序目录；自选目录已存在时默认拒绝覆盖，替换已识别程序需要 -Replace。临时验收可加 -NoPath。Linux/macOS 可设置 CODEGRAPH_INSTALL_DIR 和 CODEGRAPH_BIN_DIR。两种安装器都先校验安装包、来源和 CLI/MCP 行为，再切换安装；常规操作直接使用默认目录即可。

## 在项目中建立索引

安装全局 CLI 后，进入自己的**源码项目目录**执行，无需使用安装器路径，也无需 Fortran 专用命令：

~~~sh
cd /path/to/your/project
codegraph init
codegraph status
~~~

Windows 同样执行 codegraph init，只需把 cd 路径换成实际项目路径。init 完成初次索引，在项目中建立 .codegraph；源码变更后执行：

~~~sh
codegraph index
~~~

无论 Fortran、C++ 还是 Python，默认目录和命令都相同。CODEGRAPH_DIR 仍可按上游规则显式覆盖索引位置。由旧版本切换时，停止旧版对该项目索引的写入，再用选定的新版本执行 codegraph index 重建。

## 接入 MCP 客户端

CLI 的安装和客户端的 MCP 配置是两个步骤。安装上述 CLI 后，可以交互选择客户端：

~~~sh
codegraph install
~~~

例如，为 Codex CLI 写入全局配置：

~~~sh
codegraph install --target codex --location global --yes
~~~

其他客户端和配置选项见 codegraph install --help；项目级配置使用 --location local。配置名称沿用 codegraph，已有同名条目时检查并更新该条目。配置完成后重启客户端或 MCP 会话，并在查询时明确项目路径。

也可使用安装目录中生成的 mcp-config.json 或 codex-mcp.toml 配置片段；它们指向随包 Node 和标准 CLI。Unix 片段通过 current 链接访问程序，升级后仍可使用。启动 MCP 的命令仍为 codegraph serve --mcp；安装器不会自行修改客户端配置。

## 升级与卸载

~~~sh
codegraph upgrade --check
codegraph upgrade
codegraph uninstall
~~~

install、upgrade、uninstall 保留上游命令形式，发行查询和 CLI 安装指向**本 fork**。升级检查包含兼容的 Fortran 预览发行；升级校验新包后替换程序。本 fork 尚未提供 npm 发行，请使用这里的 Release 安装器；不会回退安装上游 npm 包。

uninstall 交互选择客户端与全局/项目配置。--location local 只处理所选项目配置；全局卸载同时处理已识别的 fork 程序和命令入口。项目 .codegraph 索引不删除，Unix 的机器状态目录也保留。Windows 运行中的 Node 可能留下一个改名的运行时文件，命令会列出其路径，退出后可清理。

## 相对上游增加了什么

- Fortran 扩展名识别与 tree-sitter WASM 语法加载。
- 模块、子模块、程序、函数、子程序、内部过程、派生类型、常量和接口等符号提取。
- USE 导入与直接调用关系；名称按 Fortran 规则归一为小写，保留原源码和过程范围。
- 固定格式首列 C/c/* 注释的等长解析处理，以及 CRLF、大写扩展名和混合语言回归样例。

本 fork 基于上游 1.6.1，不代表已同步上游当前 main 的全部更新。原有多语言索引、查询、CLI 和 MCP 接口继续保留；发行包使用 WASM 提取路径，**未包含上游 Rust 原生内核**，也禁用共享守护进程。

## 验证范围与已知限制

发布工作流要求 Windows x64、Linux x64/ARM64、macOS Intel/Apple Silicon 五个原生平台全部通过构建、相关回归、临时混合项目 CLI/MCP 与安装管理验收。Linux 验收在对应架构的 Docker 容器中进行。结果可查看 [Fortran bundles 工作流](https://github.com/shiysent-ctrl/codegraph-fortran/actions/workflows/fortran-windows.yml)。

Fortran 支持 .f、.f90、.f95、.f03、.f08、.for、.ftn、.fpp 及大写扩展名。固定格式续行和列宽、USE 重命名、复杂泛型接口、过程指针、动态分派、函数与数组下标歧义及宏展开仍有边界。完整 RHF 工程、完整 Fortran 标准、真实客户端界面切换和代理 A/B 性能不属于这套发行验收。静态代码关系不能代替编译器语义或数值正确性验证。

## 切换已有安装

安装本页版本后，确认 codegraph --version 和客户端指向同一新版，再重建选定项目索引。若 PATH 中还有旧程序，请先调整命令入口；本仓库仅提供当前发行的下载入口。

## 从源码构建与维护

普通用户使用 Release 即可。维护者在**目标平台**使用 Git、Node.js 24.x（CI 固定 24.16.0）和 npm：

~~~sh
git clone https://github.com/shiysent-ctrl/codegraph-fortran.git
cd codegraph-fortran
npm ci
npm run build
~~~

构建方法、原生验收和发布步骤见 [FORTRAN.md](FORTRAN.md)，本版更新见 [FORTRAN-RELEASE.md](FORTRAN-RELEASE.md)。源码构建和临时验收不会安装到维护者的日常环境。

## 来源、致谢与许可证

本仓库主体代码沿用 **MIT 许可证**，原作者的版权声明和许可文本保留在 [LICENSE](LICENSE)。修改和再分发时，应保留适用的版权、许可及第三方声明；MIT 允许修改和分发，具体条件以完整 [MIT 许可文本](https://opensource.org/license/mit) 为准。

| 组件 | 来源与致谢 | 随仓库保存的声明 |
| --- | --- | --- |
| CodeGraph 基础实现 | [Colby Mchenry 及 CodeGraph 贡献者](https://github.com/colbymchenry/codegraph) | [MIT 许可证及原版权声明](LICENSE) |
| Fortran tree-sitter 语法 | [stadelmanma/tree-sitter-fortran](https://github.com/stadelmanma/tree-sitter-fortran)，感谢该项目维护者和贡献者 | [语法许可证](third_party/fortran/LICENSE)、[固定源码与构建记录](third_party/fortran/manifest.json) |
| 随包 Node.js 与相关组件 | [Node.js 项目及贡献者](https://nodejs.org/)；运行时从固定上游平台包复用 | [运行时许可汇总](third_party/node/LICENSE) |

生产依赖的许可文件随发行包保留，相关版本由 [package-lock.json](package-lock.json) 记录。第三方组件遵循各自许可；根目录的 MIT 声明不替代这些条款。本 fork 的扩展不改变原作者对其作品的权利，项目名称和来源链接用于说明技术来源，本仓库的修改、支持和发行由本 fork 维护者负责。

## 维护与反馈

使用问题请提交到 [本 fork 的 Issues](https://github.com/shiysent-ctrl/codegraph-fortran/issues)。提取器、语法、测试和发行脚本以本仓库为维护源。向本 fork 的 main 合并或发布，不会自动合并到上游；向上游贡献需要另行提交 PR 并由上游审查。

新发行使用 Fortran bundles 工作流，在 main 上手动开启 publish。发行标签、安装器默认版本与包内版本需保持一致；后续版本提升基础版本，发布成功后更新下载指针。
