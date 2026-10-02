# CodeGraph 1.6.1-fortran — 多平台预览版

## 本版更新

- 增加 Linux x64/ARM64 和 macOS Intel/Apple Silicon 安装包，继续提供 Windows x64 安装包，均内置 Node 与生产依赖。
- 保留上游多语言能力并增加 Fortran，日常命令为 codegraph，项目索引为 .codegraph，MCP 名称为 codegraph。
- 安装布局与上游一致：Windows 为 %LOCALAPPDATA%\codegraph\current，Unix 为 ~/.codegraph 与 ~/.local/bin/codegraph。
- install、upgrade、uninstall 的发行渠道指向本 fork，避免升级回上游发行包；尚未提供 npm 发行。
- 安装前检查 SHA-256、来源和 CLI/MCP；Unix MCP 配置使用稳定 current 链接，Windows 卸载先移出运行中的 Node。

## 下载与开始使用

在本页 Assets 下载 install.ps1（Windows），或 install.sh（Linux/macOS）。安装脚本不是完整程序，会下载对应平台的安装包和 SHA256SUMS。

Windows，在下载目录执行：

~~~powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1
~~~

Linux/macOS，在下载目录执行：

~~~sh
CODEGRAPH_VERSION=v1.6.1-fortran sh ./install.sh
export PATH="$HOME/.local/bin:$PATH"
~~~

Windows 需重新打开终端；Unix 请将 PATH 设置加入 shell 配置。确认 codegraph --version 后，进入源码项目执行 codegraph init；以后源码变化执行 codegraph index。MCP 接入使用 codegraph install，或 codegraph install --target codex --location global --yes，并重启客户端。

离线安装请下载同一 Release 的安装脚本、对应 ZIP/tar.gz 和 SHA256SUMS。详细步骤、路径覆盖、升级和卸载见 [README](https://github.com/shiysent-ctrl/codegraph-fortran#readme)。

## 版本说明

本版统一命名为 v1.6.1-fortran，整合多平台安装与 fork 管理渠道。安装器、包内版本和升级检查采用同一名称；日常 codegraph 命令不变。已有环境请核实 PATH 与 MCP 指向本版，再重建选定项目索引。

## 验证与限制

本发行要求五个平台通过构建、相关回归、混合 Fortran/Python/C++ CLI/MCP 及安装管理验收。Linux 在对应架构 Docker 容器内执行。Windows ARM64、Alpine/musl 不支持。

所有平台使用 WASM 提取，未包含上游 Rust 原生内核，并禁用共享守护进程。复杂固定格式、泛型与动态分派等 Fortran 语义仍有边界；完整 RHF 工程、真实客户端界面和代理性能未作验证。静态图谱不替代编译或数值验证。

## 来源与许可

基于 [CodeGraph](https://github.com/colbymchenry/codegraph) by Colby Mchenry and contributors，感谢上游、tree-sitter-fortran 和 Node.js 社区。主体沿用 MIT，原作者版权声明与适用第三方许可证随源码及发行包保留。本 fork 的支持与发行由 shiysent-ctrl 独立维护；本 fork 合并和发布不会自动影响上游。
