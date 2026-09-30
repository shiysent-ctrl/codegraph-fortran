# CodeGraph Fortran 安装与使用

本 fork 是 Fortran 提取器、语法资产、样例和发行脚本的单一维护源。当前版本为 **1.6.1-fortran.2，Windows x64 预发布版**。上游 CodeGraph 的其他语言继续使用 WASM 提取路径；本发行包没有原生 Rust 内核。它保留独立安装、启动器、索引和 MCP 配置，不修改全局 CodeGraph。

## 安装

从 [v1.6.1-fortran.2](https://github.com/shiysent-ctrl/codegraph-fortran/releases/tag/v1.6.1-fortran.2) 下载 `install.ps1`，在 PowerShell 中执行：

```powershell
.\install.ps1
```

默认目录为 `%LOCALAPPDATA%\CodeGraphFortran\1.6.1-fortran.2`，运行使用发行包自带 Node，不需要安装 Node、npm 或 Fortran 编译器。脚本从本 fork 的固定 Release 下载 ZIP，校验 SHA-256，再实际验证解析、索引、CLI 和 MCP。已有目录不会被覆盖；失败保留暂存诊断目录。

指定位置：

```powershell
.\install.ps1 -Destination "D:\Tools\CodeGraphFortran\1.6.1-fortran.2"
```

离线下载同一 Release 的 ZIP 和 `SHA256SUMS`，然后执行：

```powershell
.\install.ps1 -Archive ".\codegraph-fortran-win32-x64.zip" -ChecksumFile ".\SHA256SUMS"
```

## 初始化项目并接入 MCP

使用独立启动器初始化明确选择的 Fortran 项目：

```powershell
& "$env:LOCALAPPDATA\CodeGraphFortran\1.6.1-fortran.2\bin\codegraph-fortran.cmd" init "D:\Research\FortranProject" --yes
```

索引保存在该项目的 `.codegraph-fortran`。后续使用相同启动器的 `index` 命令重建；不要对知识库根目录初始化，也不要用全局 `codegraph` 操作适配版索引。

安装目录生成 `codex-mcp.toml` 和 `mcp-config.json`。将选定片段加入对应客户端配置，重启 MCP 会话，查询时明确传入项目的 `projectPath`。服务器名为 `codegraph-fortran`，禁用共享守护进程，以避免与上游同版本进程混用。脚本不会自动修改客户端。

同一个索引只安排一个写入服务；多客户端需要同时运行时，应分别设置 `CODEGRAPH_DIR`。`install`、`upgrade` 和 `uninstall` 子命令在独立启动器中停用，避免触发上游安装流程；升级使用新的 fork 安装脚本和目录，回退时切回旧目录的 MCP 片段。

## 验证与范围

重新验收已安装 bundle：

```powershell
& "$env:LOCALAPPDATA\CodeGraphFortran\1.6.1-fortran.2\node.exe" --liftoff-only "$env:LOCALAPPDATA\CodeGraphFortran\1.6.1-fortran.2\validation\verify.cjs" "$env:LOCALAPPDATA\CodeGraphFortran\1.6.1-fortran.2"
```

验收使用临时项目，不访问研究工程。它验证模块、函数、子程序、内部过程、派生类型、常量、接口作用域、模块导入和不同大小写的直接调用，并检查完整子程序源码及真实 MCP search/explore。`verification.json` 保存构建时实际结果，`fortran-release.json` 记录源码 commit、语法来源和发行文件校验值。

支持 `.f`、`.f90`、`.f95`、`.f03`、`.f08`、`.for`、`.ftn`、`.fpp` 及大写扩展名。图中名称统一为小写，原源码保留。`.f/.for/.ftn` 的首列 `C/c/*` 注释仅在解析时等长转换，保持字节和行列位置。

本版不承诺完整 Fortran 语义：固定格式续行和列宽、USE 重命名、复杂泛型接口、过程指针、类型绑定动态分派、函数与数组下标歧义及预处理宏展开仍有边界。Linux/macOS/ARM、完整 RHF 工程以及上游要求的三种规模工程与代理 A/B 性能验证尚未完成，因此标为预发布版。

## 维护与发行

语法来自 [stadelmanma/tree-sitter-fortran](https://github.com/stadelmanma/tree-sitter-fortran/tree/2bc0220f34ca660ec9571c54ea57ed5363338de1)，MIT 许可证随包保存于 `third_party/fortran/LICENSE`。固定 commit、CLI、Emscripten 版本、ABI、构建命令及 WASM SHA-256 均在 `third_party/fortran/manifest.json`，不再发行来源不明的旧 WASM。

源码构建需要 Node 22.5–24.x：

```powershell
npm ci
npm run build
npx vitest run __tests__/fortran.test.ts
node scripts/fortran/build-release.cjs --archive "D:\Downloads\colbymchenry-codegraph-win32-x64-1.6.1.tgz"
```

构建脚本只从 SHA-512 固定的官方平台包复用 Node 和生产依赖，应用代码和语法均使用本 fork 的构建结果，不复制上游原生内核。Node 和各生产依赖的许可文件随包保留。

后续发行使用 GitHub Actions 的 **Fortran Windows** 工作流。它执行构建、Fortran 及相关回归测试、bundle 协议验收、离线安装测试，再发布本 fork 的预发布资产；不向上游 npm 命名空间发布。升级时同时更新包版本、安装入口、验证版本和语法来源记录，采用新安装目录。
