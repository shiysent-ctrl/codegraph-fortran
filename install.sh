#!/bin/sh
# CodeGraph fork standalone installer for Linux/macOS x64 and ARM64.
# 输入：fork Release 或 --archive/--checksum-file；输出：标准版本目录与 CLI 链接。
# 依赖：POSIX sh/awk/tar、curl 或 wget（联网）、sha256sum 或 shasum。
# CODEGRAPH_VERSION 固定版本；默认查询资产齐全的 fork 发行，包括预览版。
set -eu
REPO=shiysent-ctrl/codegraph-fortran
INSTALL_DIR="${CODEGRAPH_INSTALL_DIR:-$HOME/.codegraph}"
BIN_DIR="${CODEGRAPH_BIN_DIR:-$HOME/.local/bin}"
archive= checksum= uninstall=0
die() { printf 'codegraph: %s\n' "$*" >&2; exit 1; }
while [ "$#" -gt 0 ]; do
  case "$1" in
    --archive|--checksum-file)
      [ "$#" -ge 2 ] || die "Missing value for $1"
      case "$1" in --archive) archive=$2 ;; *) checksum=$2 ;; esac
      shift 2 ;;
    --uninstall) uninstall=1; shift ;;
    *) die "Unknown option: $1" ;;
  esac
done
case "$(uname -s)" in
  Linux) os=linux ;;
  Darwin) os=darwin ;;
  MINGW*|MSYS*|CYGWIN*)
    die 'On Windows, open PowerShell: irm https://raw.githubusercontent.com/shiysent-ctrl/codegraph-fortran/main/install.ps1 | iex' ;;
  *) die 'Unsupported operating system' ;;
esac
case "$(uname -m)" in
  x86_64|amd64) arch=x64 ;;
  arm64|aarch64) arch=arm64 ;;
  *) die 'Unsupported architecture' ;;
esac
target=$os-$arch
asset=codegraph-fortran-$target.tar.gz
name=codegraph-fortran-$target
mkdir -p "$INSTALL_DIR" "$BIN_DIR"
INSTALL_DIR=$(cd "$INSTALL_DIR" && pwd -P)
BIN_DIR=$(cd "$BIN_DIR" && pwd -P)
[ "$INSTALL_DIR" != / ] && [ "$INSTALL_DIR" != "$(cd "$HOME" && pwd -P)" ] || die 'Unsafe install root'
if [ "$uninstall" -eq 1 ]; then
  # 委托 CLI，保留机器状态与项目索引，复用同一套卸载边界。
  [ -x "$INSTALL_DIR/current/bin/codegraph" ] || die 'No installed bundle found; use codegraph uninstall for other installation methods'
  exec "$INSTALL_DIR/current/bin/codegraph" uninstall --yes
fi
download() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL --connect-timeout 15 --max-time 180 "$1" -o "$2"
  elif command -v wget >/dev/null 2>&1; then
    wget -q --timeout=180 -O "$2" "$1"
  else die 'Install curl or wget, or supply --archive and --checksum-file'; fi
}
tmp=$(mktemp -d "$INSTALL_DIR/.install-XXXXXXXX")
backup= dest= committed=0 swapped=0
old_current= old_shim= previous_dir=
cleanup() {
  status=$?
  trap - EXIT HUP INT TERM
  # 失败时恢复同版本目录及链接；只清理本次建立的暂存目录。
  if [ "$committed" -eq 0 ] && [ "$swapped" -eq 1 ]; then
    [ ! -d "$dest" ] || rm -rf "$dest"
    if [ -n "$backup" ] && [ -d "$backup" ]; then mv "$backup" "$dest"; fi
    rm -f "$INSTALL_DIR/current" "$BIN_DIR/codegraph"
    [ -z "$old_current" ] || ln -s "$old_current" "$INSTALL_DIR/current"
    [ -z "$old_shim" ] || ln -s "$old_shim" "$BIN_DIR/codegraph"
  fi
  rm -rf "$tmp"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM
version="${CODEGRAPH_VERSION:-}"
if [ -z "$version" ]; then
  [ -z "$archive" ] || die 'Offline installation requires CODEGRAPH_VERSION'
  download "https://api.github.com/repos/$REPO/releases?per_page=100" "$tmp/releases.json" || die 'Could not query fork releases; pin CODEGRAPH_VERSION to a published fork tag'
  # POSIX awk 解析嵌套 JSON，避免依赖系统 Node/Python/jq。
  # 同一基础版本的无编号版优先于编号预览；只选择当前平台资产齐全的发行。
  version=$(awk -v asset="$asset" '
    function fail() { bad=1; exit 1 }
    function space() { while (substr(json,pos,1) ~ /[ \t\r\n]/ && pos<=length(json)) pos++ }
    function string( c,result) {
      if (substr(json,pos++,1)!="\"") fail()
      result=""
      while (pos<=length(json)) {
        c=substr(json,pos++,1)
        if (c=="\"") return result
        if (c=="\\") {
          c=substr(json,pos++,1)
          if (c=="u") { result=result "?"; pos+=4; continue }
          if (c!~/["\\\/bfnrt]/) fail()
        }
        result=result c
      }
      fail()
    }
    function value(route, c,key,v) {
      space(); c=substr(json,pos,1)
      if (c=="{") {
        pos++; space()
        if (substr(json,pos,1)=="}") {pos++; return}
        while (1) {
          space(); key=string(); space()
          if (substr(json,pos++,1)!=":") fail()
          value(route "." key); space(); c=substr(json,pos++,1)
          if (c=="}") return
          if (c!=",") fail()
        }
      }
      if (c=="[") {
        pos++; space()
        if (substr(json,pos,1)=="]") {pos++; return}
        while (1) {
          value(route "[]"); space(); c=substr(json,pos++,1)
          if (c=="]") return
          if (c!=",") fail()
        }
      }
      if (c=="\"") v=string()
      else {
        v=""
        while (pos<=length(json) && substr(json,pos,1)!~/[ \t\r\n,}\]]/) v=v substr(json,pos++,1)
        if (v!~/^(true|false|null|-?[0-9]+([.][0-9]+)?([eE][+-]?[0-9]+)?)$/) fail()
      }
      if (route==".tag_name") tag=v
      if (route==".draft") draft=v
      if (route==".assets[].name") have[v]=1
    }
    function newer(a,b, aa,bb,i) {
      sub(/^v/,"",a); sub(/^v/,"",b)
      split(a,aa,/[-.]/); split(b,bb,/[-.]/)
      for(i=1;i<=3;i++) if(aa[i]+0!=bb[i]+0) return aa[i]+0>bb[i]+0
      if(aa[5]=="" && bb[5]!="") return 1
      if(aa[5]!="" && bb[5]=="") return 0
      return aa[5]+0>bb[5]+0
    }
    { json=json $0 "\n" }
    END {
      if(bad) exit 1
      pos=1; space(); if(substr(json,pos++,1)!="[") fail()
      space(); if(substr(json,pos,1)=="]") exit 0
      while(1) {
        delete have; tag=""; draft="false"; value("")
        if(tag~/^v?[0-9]+[.][0-9]+[.][0-9]+-fortran([.][0-9]+)?$/ && draft=="false" &&
           have[asset] && have["SHA256SUMS"] && have["install.sh"] &&
           !newer("v1.6.1-fortran.3",tag) && (best=="" || newer(tag,best))) best=tag
        space(); c=substr(json,pos++,1)
        if(c=="]") break
        if(c!=",") fail()
      }
      space(); if(pos<=length(json)) fail()
      if(best!="") print best
    }' "$tmp/releases.json") || die 'Invalid release response'
fi
[ -n "$version" ] || die "No compatible fork release for $target; this platform needs a published bundle"
case "$version" in v*) ;; *) version=v$version ;; esac
printf '%s\n' "$version" | awk '/^v[0-9]+[.][0-9]+[.][0-9]+-fortran([.][0-9]+)?$/ {ok=1} END {exit !ok}' || die 'Invalid fork release version'
if [ -z "$archive" ]; then
  base=https://github.com/$REPO/releases/download/$version
  download "$base/$asset" "$tmp/$asset" || die "Download failed: $base/$asset"
  download "$base/SHA256SUMS" "$tmp/SHA256SUMS" || die 'Checksum download failed'
  archive=$tmp/$asset
  checksum=$tmp/SHA256SUMS
fi
[ -f "$archive" ] && [ -f "$checksum" ] || die 'Archive and checksum file are required'
expected=$(awk -v asset="$asset" '$2==asset && length($1)==64 && $1!~/[^0-9a-fA-F]/ {n++; sum=tolower($1)} END {if(n!=1)exit 1;print sum}' "$checksum") || die 'Missing or ambiguous SHA256SUMS entry'
if command -v sha256sum >/dev/null 2>&1; then actual=$(sha256sum "$archive" | awk '{print $1}')
elif command -v shasum >/dev/null 2>&1; then actual=$(shasum -a 256 "$archive" | awk '{print $1}')
else die 'Install sha256sum or shasum'; fi
[ "$expected" = "$actual" ] || die 'Archive SHA-256 mismatch'
# 拒绝路径穿越与链接，只向临时目录解包；校验失败不改变已安装版本。
tar -tzf "$archive" > "$tmp/entries" || die 'Invalid archive'
awk -v prefix="$name/" 'index($0,prefix)!=1 || $0 ~ /(^|\/)\.\.(\/|$)/ || $0 ~ /\\/ {bad=1} END {exit bad || NR==0}' "$tmp/entries" || die 'Unsafe archive path'
tar -tvzf "$archive" > "$tmp/modes" || die 'Could not inspect archive'
awk 'substr($0,1,1)!="-" && substr($0,1,1)!="d" {bad=1} END {exit bad}' "$tmp/modes" || die 'Archive links or special files are not allowed'
mkdir "$tmp/unpacked"
tar -xzf "$archive" -C "$tmp/unpacked"
stage=$tmp/unpacked/$name
[ -x "$stage/node" ] && [ -x "$stage/bin/codegraph" ] && [ -f "$stage/validation/verify.cjs" ] || die 'Incomplete or non-executable bundle'
"$stage/node" --liftoff-only -e '
  const fs=require("node:fs"),p=require("node:path");const r=JSON.parse(fs.readFileSync(p.join(process.argv[1],"fortran-release.json"),"utf8"));
  if(r.repository!==process.argv[2] || "v"+r.version!==process.argv[3] || r.target!==process.argv[4] || r.cliName!=="codegraph" || r.indexDirectory!==".codegraph") throw Error("Bundle identity mismatch");
' "$stage" "$REPO" "$version" "$target"
"$stage/node" --liftoff-only "$stage/validation/verify.cjs" "$stage"
mkdir -p "$INSTALL_DIR/versions"
[ ! -L "$INSTALL_DIR/versions" ] || die 'versions must be a real directory'
dest=$INSTALL_DIR/versions/$version
[ ! -L "$dest" ] || die 'Version destination must not be a symlink'
if [ -e "$dest" ]; then
  [ ! -e "$dest/.git" ] && [ -f "$dest/node" ] && [ -f "$dest/lib/package.json" ] && [ -f "$dest/bin/codegraph" ] || die 'Refusing to replace an unrelated directory'
  "$stage/node" --liftoff-only -e 'const p=require(process.argv[1]);if(!["@shiysent-ctrl/codegraph-fortran","@colbymchenry/codegraph"].includes(p.name))throw Error("Unrelated package")' "$dest/lib/package.json"
fi
for link in "$INSTALL_DIR/current" "$BIN_DIR/codegraph"; do
  if [ -L "$link" ]; then
    link_target=$(readlink "$link")
    case "$link_target" in /*) ;; *) link_target=$(dirname "$link")/$link_target ;; esac
    link_parent=$(cd "$(dirname "$link_target")" && pwd -P) || die 'Unrecognized existing launcher link'
    case "$link_parent/$(basename "$link_target")" in "$INSTALL_DIR"/*) ;; *) die "Refusing to replace unrelated link: $link" ;; esac
    if [ "$link" = "$INSTALL_DIR/current" ]; then
      old_current=$(readlink "$link")
      previous_dir=$(cd "$link" && pwd -P)
    else old_shim=$(readlink "$link"); fi
  elif [ -e "$link" ]; then die "Refusing to replace unrelated file: $link"; fi
done
"$stage/node" --liftoff-only "$stage/validation/write-config.cjs" "$stage" "$INSTALL_DIR/current"
if [ -d "$dest" ]; then backup=$tmp/previous; mv "$dest" "$backup"; fi
swapped=1
mv "$stage" "$dest"
ln -sfn "$dest" "$INSTALL_DIR/current"
ln -sfn "$dest/bin/codegraph" "$BIN_DIR/codegraph"
committed=1
# 留存前一个正在使用的版本，避免升级命令的后续动态导入找不到旧模块。
# 更早的已识别 fork bundle 在下一次成功安装时清理；不删除未知目录或符号链接。
# >>> CODEGRAPH_PRUNE_OLD_VERSIONS
pruned=0
if [ -d "$INSTALL_DIR/versions" ]; then
  for d in "$INSTALL_DIR/versions"/*; do
    [ -d "$d" ] && [ ! -L "$d" ] && [ ! -e "$d/.git" ] || continue
    [ "$d" != "$dest" ] && [ "$d" != "${previous_dir:-}" ] || continue
    [ -f "$d/node" ] && [ -f "$d/bin/codegraph" ] && [ -f "$d/fortran-release.json" ] || continue
    # 只清理携带本 fork 来源标记的版本；项目、上游及手工目录不会被此步骤移除。
    if awk '/"repository"[ \t]*:[ \t]*"shiysent-ctrl\/codegraph-fortran"/ {ok=1} END {exit !ok}' "$d/fortran-release.json"; then
      if rm -rf "$d"; then pruned=$((pruned + 1)); fi
    fi
  done
fi
if [ "$pruned" -gt 0 ]; then printf 'Removed    %s older version(s)\n' "$pruned"; fi
# <<< CODEGRAPH_PRUNE_OLD_VERSIONS
printf 'Installed CodeGraph %s (%s)\n  %s\n' "$version" "$target" "$BIN_DIR/codegraph"
case ":$PATH:" in
  *":$BIN_DIR:"*)
    winner=$(command -v codegraph || true)
    [ "$winner" = "$BIN_DIR/codegraph" ] || printf 'Another codegraph is earlier on PATH: %s\n' "$winner" ;;
  *) printf 'Add to your shell profile, then open a new terminal:\n  export PATH="%s:$PATH"\n' "$BIN_DIR" ;;
esac
printf 'Run codegraph init in your project, then codegraph install to configure your MCP client.\n'
