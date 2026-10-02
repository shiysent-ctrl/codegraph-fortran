#!/bin/sh
# 功能：解析全局符号链接并启动随包 CLI；参数原样传递，保留默认 .codegraph。
# 依赖：POSIX sh/readlink、bundle 内的 Node；不依赖系统 Node/npm。
SELF="$0"
while [ -L "$SELF" ]; do
  target="$(readlink "$SELF")"
  case "$target" in
    /*) SELF="$target" ;;
    *) SELF="$(dirname "$SELF")/$target" ;;
  esac
done
DIR="$(cd "$(dirname "$SELF")/.." && pwd -P)"
CODEGRAPH_HOST_PPID="${CODEGRAPH_HOST_PPID:-${PPID:-}}"
export CODEGRAPH_HOST_PPID
export CODEGRAPH_NO_DAEMON=1 CODEGRAPH_NO_UPDATE_CHECK=1 CODEGRAPH_TELEMETRY=0
exec "$DIR/node" --liftoff-only --disable-warning=ExperimentalWarning "$DIR/lib/dist/bin/codegraph.js" "$@"
