### Highlights

- The Fortran extension now uses the standard `codegraph` commands, `.codegraph` project index and `codegraph` MCP name.
- Existing languages and mixed Fortran, Python and C++ projects use the same CLI and MCP.
- Windows x64 users can install a self-contained bundle with the attached `install.ps1`; the installer checks the ZIP and CLI/MCP before completing installation.

### Installing

Download `install.ps1` and run `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\install.ps1`. For offline installation, download all three assets and follow [FORTRAN.md](https://github.com/shiysent-ctrl/codegraph-fortran/blob/main/FORTRAN.md). Existing destinations are never overwritten; PATH, global installations and client configurations are not automatically changed.

### Upgrading from preview 2

Preview 2 uses `codegraph-fortran.cmd` and `.codegraph-fortran`. This release uses `bin/codegraph.cmd` and the default `.codegraph` directory. Select the new CLI and `codegraph` MCP configuration, stop previous writers, and rebuild the selected project index. Preview 2 assets remain unchanged. Fork upgrades use this fork's release assets; inherited CLI installation commands still target upstream channels.

### Preview scope and attribution

Windows x64 only; all languages use WASM extraction and the bundle does not include the upstream native kernel. Linux/macOS/ARM, full RHF projects, complete fixed-form rules and agent A/B performance remain unverified.

Based on CodeGraph by Colby Mchenry and contributors, with thanks to the tree-sitter-fortran and Node.js communities. Original copyright and third-party license notices are retained in the bundle.
