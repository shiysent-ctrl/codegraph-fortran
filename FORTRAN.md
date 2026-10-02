# CodeGraph 的 Fortran 扩展

本 fork 保留 CodeGraph 原有语言支持并增加 Fortran；Python、C++ 和混合项目使用同一套命令。CLI 为 `codegraph`，默认项目索引为 `.codegraph`，MCP 配置名为 `codegraph`。`CODEGRAPH_DIR` 仍可按上游规则显式覆盖。包名、仓库名和发行资产中的 Fortran 用于标识来源，不改变日常命令。

## 当前状态

标准入口对应 **v1.6.1-fortran.3，Windows x64 预览版**。[旧 v1.6.1-fortran.2](https://github.com/shiysent-ctrl/codegraph-fortran/releases/tag/v1.6.1-fortran.2) 保持原样，仍采用旧的独立入口。

从 [v1.6.1-fortran.3](https://github.com/shiysent-ctrl/codegraph-fortran/releases/tag/v1.6.1-fortran.3) 下载 `install.ps1` 后运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
```

默认二进制目录为 `%LOCALAPPDATA%\CodeGraphFortran\1.6.1-fortran.3`。脚本下载并校验同一 Release 的资产，使用随包 Node；已有目录不覆盖，PATH 和客户端配置不自动修改。

构建不会安装新版、修改 PATH 或切换客户端。继续使用已经支持 Fortran 的旧版；准备好新发行版并明确决定切换后，再安装。当前 Windows x64 包沿用 WASM 提取路径，未包含上游 Rust 原生内核。

## 只构建和验证

在本 fork 工作目录中，使用 Node 24.x：

```powershell
npm ci
npm run build
npx vitest run __tests__/fortran.test.ts __tests__/extraction.test.ts __tests__/grammar-wasm-bytes.test.ts __tests__/preload-languages.test.ts __tests__/cross-language-resolution.test.ts
node scripts/fortran/build-release.cjs --archive "D:\Downloads\colbymchenry-codegraph-win32-x64-1.6.1.tgz" --output "D:\Build\CodeGraphPreview"
```

构建脚本校验固定官方平台包 SHA-512，只复用 Node 和生产依赖；应用代码、Fortran 提取器及语法来自本 fork。输出 ZIP、SHA256SUMS、安装脚本和验证收据；不安装到日常环境。验收在临时混合项目中实际运行标准命令，检查默认目录、Fortran/Python/C++ 符号和调用边以及 MCP initialize/search/explore。

## 日常命令保持一致

下面示例适用于将来明确切换到本版后的环境：

```powershell
codegraph init "D:\Research\MixedProject" --yes
Set-Location "D:\Research\MixedProject"
codegraph index
codegraph status
codegraph serve --mcp
```

命令不按语言另起名称；上述项目默认使用 `.codegraph`。在当前机器直接输入 `codegraph`，仍调用现有旧版。要选择一个已解压的测试构建而不修改 PATH，可以使用它的绝对路径 `D:\Build\Preview\bin\codegraph.cmd`。

生成的 `mcp-config.json` 和 `codex-mcp.toml` 使用 `codegraph` 名称，指向所选构建自带 Node 和 CLI，不强制覆盖索引目录；不会自动修改客户端。将来切换时替换现有 `codegraph` 条目即可，不需另建 Fortran 专用 MCP。新版包暂时禁用共享守护进程，避免不同构建进程混用。

## 安装与升级

离线安装时，使用同一 Release 的安装脚本、ZIP 和 SHA256SUMS：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1 -Archive .\codegraph-fortran-win32-x64.zip -ChecksumFile .\SHA256SUMS -Destination "D:\Tools\CodeGraph\1.6.1-fortran.3"
```

安装脚本核实收据包含标准 CLI/索引约定，拒绝误用旧隔离版；已有目标目录不会覆盖。它不会修改全局 CodeGraph、PATH 或客户端。`install`、`upgrade`、`uninstall` 子命令仍转交原版 CLI；这些子命令的安装渠道仍沿用上游，不能用来升级本 fork 的发行包，本次也未运行它们。fork 升级使用对应的发行资产和安装脚本。

新版默认与旧版使用同名索引，因此切换时应停止旧版写入，选定实际项目后用新版重建索引。首次使用时先在临时项目验证命令和目录，再决定是否切换真实研究项目。

## Fortran 支持与边界

支持 `.f`、`.f90`、`.f95`、`.f03`、`.f08`、`.for`、`.ftn`、`.fpp` 及大写扩展名；模块、函数、子程序、内部过程、派生类型、常量、接口作用域、USE 导入与直接调用保留完整源码范围。名称归一为小写，源码保留。固定格式首列 C/c/* 注释在解析时等长转换，保持字节和行列位置。

固定格式续行和列宽、USE 重命名、复杂泛型、过程指针、动态分派、函数与数组下标歧义及宏展开仍有边界。Linux/macOS/ARM、完整 RHF 工程、三种规模工程与代理 A/B 性能未验证；混合样例验证不等于完整语言语义或性能验证。

语法来自 [stadelmanma/tree-sitter-fortran 的固定 MIT 源码](https://github.com/stadelmanma/tree-sitter-fortran/tree/2bc0220f34ca660ec9571c54ea57ed5363338de1)，许可证及 WASM 构建记录随包保存在 `third_party/fortran`。

## 当前源码管理渠道（未发布）

源码安装器沿用 `%LOCALAPPDATA%\codegraph\current` 和用户 PATH，`codegraph install` 的 CLI 安装及 `codegraph upgrade` 的发行查询指向本 fork。升级校验 ZIP、来源与标准入口后复用安装器替换程序；`uninstall` 使用标准目录与配置名，并仅识别本 fork 的 npm 包名。预览版参与升级检查，旧隔离发行被排除。

本页前述隔离安装步骤描述的是保持原样的已发布 v1.6.1-fortran.3。源码安装的临时验收应额外使用 `-NoPath`；正式默认安装会替换可识别的标准 CodeGraph 程序目录。npm 发行尚未提供，不回退到上游。当前源码增加 Linux x64/ARM64 与 macOS Intel/Apple Silicon bundle 构建、安装和管理流程；对应安装包尚未发布。

## Linux/macOS 源码支持（未发布）

Unix 使用 `~/.codegraph/versions/<tag>` 和 `~/.local/bin/codegraph`，与上游一致。构建需在目标平台进行；`build-release.cjs` 按系统和架构选择固定运行时，校验 SHA-512，输出 tar.gz。`install.sh` 校验 SHA-256、平台和来源，执行混合语言 CLI/MCP 验收后切换链接；失败恢复原目录和链接，保留前一个版本并清理更早的可识别 fork 包。

`check-management-unix.cjs` 使用临时 HOME 和项目验证默认布局、CLI 初始化、客户端配置、运行时替换、坏包拒绝、卸载保留项目索引和机器状态。`Fortran bundles` 工作流新增 Linux x64/ARM64（Docker）和 macOS Intel/Apple Silicon 原生任务；五个平台通过后合并资产和 SHA256SUMS。未发布 npm 包，不使用上游安装渠道。

操作步骤见 [README](README.md)。这些修改位于开发分支 `codex/fork-management`，原生 Linux/macOS 验收等待在对应系统或 CI 执行；Git Bash 的 shell 检查不等同于原生验收。已发布 v1.6.1-fortran.3 不包含这些修改。

## 维护与发行

本 fork 是提取器、语法、样例、发行脚本的单一维护源。知识库仅维护入口和说明。发布前需选择新版本，同步包、验证器、安装脚本和入口指针，再运行 **Fortran bundles** 工作流；旧 tag/资产保持原样。发布完成后才更新知识库入口的 Release、SHA-256，并将 `releaseAvailable` 改为 `true`。
