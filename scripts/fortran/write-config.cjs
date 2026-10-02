"use strict";
/** 功能：为已选定的独立安装路径生成 MCP 片段；不修改任何客户端。
 * 输入：暂存目录、最终安装目录；输出：JSON 和 TOML 配置片段。依赖：Node 内置模块。
 */
const fs = require('node:fs');
const path = require('node:path');
const output = fs.realpathSync(process.argv[2]);
const destination = path.resolve(process.argv[3]);
const command = path.join(destination, process.platform === 'win32' ? 'node.exe' : 'node');
const args = ['--liftoff-only', '--disable-warning=ExperimentalWarning', path.join(destination, 'lib/dist/bin/codegraph.js'), 'serve', '--mcp'];
const env = { CODEGRAPH_NO_DAEMON: '1', CODEGRAPH_NO_UPDATE_CHECK: '1',
  CODEGRAPH_TELEMETRY: '0', CODEGRAPH_MCP_TOOLS: 'explore,search,node,callers,callees,impact,files,status' };
fs.writeFileSync(path.join(output, 'mcp-config.json'), JSON.stringify({ mcpServers: { codegraph: { command, args, env } } }, null, 2) + '\n');
fs.writeFileSync(path.join(output, 'codex-mcp.toml'), ['[mcp_servers.codegraph]', `command = ${JSON.stringify(command)}`,
  `args = ${JSON.stringify(args)}`, '', '[mcp_servers.codegraph.env]',
  ...Object.entries(env).map(([key, value]) => `${key} = ${JSON.stringify(value)}`), ''].join('\n'));
