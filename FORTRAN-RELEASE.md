### Highlights

- The Fortran extension uses the standard `codegraph` commands, `.codegraph` index and `codegraph` MCP name.
- Existing languages and mixed Fortran, Python and C++ projects continue to use the same CLI and MCP.
- Building and verifying a preview does not install it or switch an existing CodeGraph environment.

### Preview scope

These command changes are not yet in a published release. Choose a new version before publishing; existing release assets are never overwritten. Windows x64 only; the bundle uses WASM extraction and does not include the upstream native kernel. Linux/macOS/ARM, full RHF projects, complete fixed-form rules and agent A/B performance remain unverified.

Before switching an existing project, stop the previous version's writers and rebuild its index using the selected new version. Fork installations and upgrades use this fork's release assets; the inherited CLI installation commands still target upstream channels. See [FORTRAN.md](https://github.com/shiysent-ctrl/codegraph-fortran/blob/main/FORTRAN.md).
