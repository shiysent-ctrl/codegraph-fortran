# Fortran 扩展维护说明

用户安装与日常使用以 [README](README.md) 为准。本 fork 基于上游 CodeGraph 1.6.1，当前版本为 1.6.1-fortran.4；CLI、MCP 名称和项目索引沿用 codegraph、codegraph 和 .codegraph，保留其他语言支持。

## 构建发行包

在所选目标平台使用 Node 24.16.0。先 npm ci、npm run build，再下载固定的上游运行时包。构建脚本校验记录中的 SHA-512，只复用其 Node 与生产依赖；应用、语法、提取器及样例来自本 fork。

Windows x64（PowerShell）：

~~~powershell
npm pack @colbymchenry/codegraph-win32-x64@1.6.1 --pack-destination . --silent
node scripts/fortran/build-release.cjs --archive .\colbymchenry-codegraph-win32-x64-1.6.1.tgz
node scripts/fortran/check-powershell51.cjs
node scripts/fortran/check-management.cjs
~~~

Linux/macOS（POSIX shell）：

~~~sh
target="$(node -p 'process.platform+"-"+process.arch')"
npm pack "@colbymchenry/codegraph-$target@1.6.1" --pack-destination /tmp --silent
node scripts/fortran/build-release.cjs --archive "/tmp/colbymchenry-codegraph-$target-1.6.1.tgz"
node scripts/fortran/check-management-unix.cjs
~~~

默认输出 release/fortran，包含对应 ZIP/tar.gz、SHA256SUMS 和安装脚本。已存在的包不会覆盖；需要再次构建时用 --output 指定新目录，管理验收脚本也可接收该输出目录作为首个参数。

构建器在临时 Fortran/Python/C++ 项目中运行 CLI/MCP 验收。包内 fortran-release.json 记录来源提交、版本、平台、依赖和语法来源；verification.json 保存验收结果。管理验收在私有 HOME、PATH 和临时项目中进行，不切换日常环境。

## 安装与管理约定

Windows 默认 %LOCALAPPDATA%\codegraph\current；Linux/macOS 默认 ~/.codegraph/versions/<tag>，current 链接和 ~/.local/bin/codegraph。安装器校验包与来源、验收新 CLI/MCP 后再切换。Unix 保留前一个活动版本以支持运行中的升级，并仅清理更早的已识别 fork 程序；项目索引和机器状态不作为程序目录删除。

install、upgrade 和 uninstall 保持原版命令形式，发行渠道指向 shiysent-ctrl/codegraph-fortran。尚无 npm 发行，不回退使用上游安装渠道。手工 MCP 片段指向稳定的 current 程序路径。安装脚本、源码构建和验收不会自动修改维护者的 MCP 配置。

## 回归与发布

Fortran bundles 工作流覆盖 Windows x64、Linux x64/ARM64 和 macOS x64/ARM64。Linux 在对应架构的 Docker 容器内验收；macOS 和 Windows 使用原生 runner。五个平台全部通过后才合并资产和校验清单。

1. 选择未使用的新版本，同步 package.json、package-lock.json、ui/package.json 与 install.ps1 默认版本。
2. 更新 README、FORTRAN-RELEASE.md 和 CHANGELOG 的 Unreleased 部分，保留适用版权与许可。
3. 提交 PR 到本 fork 的 main，查看 Fortran bundles 原生验收，修复失败项后合并。
4. 在本 fork 的 Actions → Fortran bundles → Run workflow，选择 main，并开启 publish。不要运行继承的上游 Release/npm 发布工作流。
5. 工作流重新构建并验收，发布新预览 tag，附五个安装包、两种安装器与 SHA256SUMS。已有 tag/资产不覆盖。
6. 核实公开 Release 与校验值，在隔离目录验证公开安装包；成功后更新知识库入口的版本、Release 和安装器 SHA-256。

Release 说明以 FORTRAN-RELEASE.md 为来源，工作流检查其版本与源码一致。源码推送、main 合并和发行包发布是分别完成的步骤，修改脚本不会自动重建旧 Release。

## 语法来源与解析边界

语法来自 [stadelmanma/tree-sitter-fortran 固定源码](https://github.com/stadelmanma/tree-sitter-fortran/tree/2bc0220f34ca660ec9571c54ea57ed5363338de1)，许可证、构建记录和固定来源随 third_party/fortran 保存。根 MIT、原作者声明、Node 许可和生产依赖许可继续保留，详见 README。

Fortran 名称归一为小写、保留源码范围；固定格式首列 C/c/* 注释通过等长转换保持位置。复杂固定格式、USE 重命名、泛型、过程指针、动态分派、函数/数组歧义及宏仍有边界。包使用 WASM 提取，未包含 Rust 原生内核，并禁用共享守护进程。

回归、CLI/MCP 和安装管理验收不能替代完整工程的编译、运行、数值与物理验证；真实客户端界面和代理性能需另行验证。维护时回到当前源码核实关系，不以静态图谱代替编译器语义。
