### Highlights

- Fortran modules, routines, derived types and direct calls can be searched and explored with complete routine source.
- Windows x64 users can install this fork alongside an existing CodeGraph installation without changing PATH or client configuration.
- The installer generates independent Codex TOML and MCP JSON configuration snippets and verifies CLI/MCP behavior before completing installation.

Use the attached `install.ps1`; it downloads the fixed ZIP from this fork and checks `SHA256SUMS`. For offline installation, download all three assets and follow [FORTRAN.md](https://github.com/shiysent-ctrl/codegraph-fortran/blob/main/FORTRAN.md).

### Preview scope

This is a Windows x64 prerelease. Linux/macOS/ARM, full RHF projects, complete fixed-form rules and agent A/B performance validation have not been certified. The bundle uses WASM extraction for all languages and does not include the upstream native kernel. Keep existing installations and use the separate `.codegraph-fortran` index.

The Fortran WASM is built from a pinned MIT-licensed source revision; its license and build receipt ship in the bundle.
