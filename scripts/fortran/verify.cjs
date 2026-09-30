"use strict";
/** 功能：在临时项目验证固定适配版的解析、索引、源码范围及 MCP stdio。
 * 输入：隔离 bundle 路径；输出：验证结果。依赖：bundle 自带 Node、SQLite 和 CodeGraph。
 * 不读取或写入用户研究项目，不初始化当前知识库的索引。
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawnSync, spawn } = require('node:child_process');
const crypto = require('node:crypto');
const manifest = { indexDirectory: '.codegraph-fortran' };
const fixtureRoot = fs.existsSync(path.join(__dirname, 'fixtures')) ? path.join(__dirname, 'fixtures') : path.resolve(__dirname, '../../__tests__/fixtures/fortran');
const env = { ...process.env, CODEGRAPH_TELEMETRY: '0', CODEGRAPH_NO_UPDATE_CHECK: '1',
  CODEGRAPH_NO_DAEMON: '1', CODEGRAPH_DIR: manifest.indexDirectory };

function runtime(bundle) { return path.join(bundle, process.platform === 'win32' ? 'node.exe' : 'node'); }
function run(bundle, args, cwd) {
  const result = spawnSync(runtime(bundle), ['--liftoff-only', ...args], {
    cwd, env, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || result.stdout);
  return result.stdout;
}
async function mcp(bundle, project) {
  const child = spawn(runtime(bundle), ['--liftoff-only', path.join(bundle, 'lib/dist/bin/codegraph.js'), 'serve', '--mcp'],
    { cwd: project, env: { ...env, CODEGRAPH_MCP_TOOLS: 'explore,search,node,callers,callees,impact,files,status' }, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map();
  let buffer = '', stderr = '', seq = 0;
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-3000); });
  child.stdout.on('data', chunk => {
    buffer += chunk.toString('utf8');
    for (;;) {
      const end = buffer.indexOf('\n'); if (end < 0) break;
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      try {
        const message = JSON.parse(line);
        const entry = pending.get(message.id);
        if (entry) { pending.delete(message.id); clearTimeout(entry.timer); entry.resolve(message); }
      } catch { /* 非协议日志留给超时诊断，不视为成功。 */ }
    }
  });
  child.on('error', error => { for (const entry of pending.values()) entry.reject(error); });
  child.on('exit', () => { for (const entry of pending.values()) entry.reject(new Error(`MCP 提前退出：${stderr}`)); });
  function request(method, params) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`MCP 超时 ${method}：${stderr}`)); }, 15000);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  try {
    const initialized = await request('initialize', { protocolVersion: '2024-11-05', capabilities: {},
      clientInfo: { name: 'codegraph-fortran-verifier', version: 'fortran.1' } });
    assert.ok(initialized.result?.serverInfo);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const listed = await request('tools/list', {});
    assert.ok(listed.result?.tools?.some(tool => tool.name === 'codegraph_search'), JSON.stringify(listed));
    const found = await request('tools/call', { name: 'codegraph_search', arguments: { query: 'advance', projectPath: project } });
    assert.ok(found.result && !found.result.isError && !found.error, JSON.stringify(found));
    assert.match(JSON.stringify(found.result), /advance/i);
    const explored = await request('tools/call', { name: 'codegraph_explore', arguments: { query: 'UpdateField', projectPath: project, maxFiles: 4 } });
    assert.ok(explored.result && !explored.result.isError && !explored.error, JSON.stringify(explored));
    assert.match(JSON.stringify(explored.result), /end subroutine UpdateField/i);
    return { initialize: true, search: true, explore: true };
  } finally {
    for (const entry of pending.values()) clearTimeout(entry.timer);
    pending.clear();
    child.stdin.end();
    if (child.exitCode === null) await new Promise(resolve => {
      const timer = setTimeout(() => { child.kill(); resolve(); }, 5000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
    });
  }
}
async function verify(bundle) {
  bundle = fs.realpathSync(bundle);
  const receipt = JSON.parse(fs.readFileSync(path.join(bundle, 'fortran-release.json'), 'utf8'));
  assert.equal(receipt.version, '1.6.1-fortran.1');
  for (const [relative, expected] of Object.entries(receipt.files)) {
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(bundle, relative))).digest('hex');
    assert.equal(actual, expected, `发行文件校验失败：${relative}`);
  }
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'cgfortran-verify-'));
  let success = false;
  try {
    for (const name of fs.readdirSync(fixtureRoot)) {
      fs.copyFileSync(path.join(fixtureRoot, name), path.join(project, name));
    }
    // CRLF 单独复制一份外部子程序，以验证换行不会改变符号位置。
    fs.writeFileSync(path.join(project, 'windows.f90'), 'subroutine WindowsLine()\r\ncall UPDATEFIELD()\r\nend subroutine WindowsLine\r\n');
    fs.writeFileSync(path.join(project, 'codegraph.json'), JSON.stringify({ exclude: ['probe.cjs', 'db.cjs'] }));
    const parserProbe = path.join(project, 'probe.cjs');
    const dist = path.join(bundle, 'lib/dist');
    fs.writeFileSync(parserProbe, `
const assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path');
const g=require(${JSON.stringify(path.join(dist, 'extraction/grammars.js'))});
const {TreeSitterExtractor}=require(${JSON.stringify(path.join(dist, 'extraction/tree-sitter.js'))});
(async()=>{
 await g.loadGrammarsForLanguages(['fortran']); assert.ok(g.isGrammarLoaded('fortran'));
 const types=require(${JSON.stringify(path.join(dist, 'types.js'))}); assert.ok(types.LANGUAGES.includes('fortran'));
 const adapter=require(${JSON.stringify(path.join(dist, 'extraction/languages/fortran.js'))}).fortranExtractor;
 const fixedComment='C 中文注释\\r\\n      CALL Target()\\r\\n';
 const normalized=adapter.preParse(fixedComment,'example.f');
 assert.equal(Buffer.byteLength(normalized),Buffer.byteLength(fixedComment));
 assert.equal(normalized.split('\\n').length,fixedComment.split('\\n').length);
 assert.equal(adapter.preParse(fixedComment,'example.f90'),fixedComment);
 for(const file of fs.readdirSync(__dirname).filter(f=>/\\.(f|f90)$/i.test(f))){
  const source=fs.readFileSync(path.join(__dirname,file),'utf8');
  const result=new TreeSitterExtractor(file,source,'fortran').extract(); assert.equal(result.errors.length,0,JSON.stringify(result.errors));
  for(const node of result.nodes) assert.ok(types.NODE_KINDS.includes(node.kind),node.kind);
  if(file==='fields.F90'){
   const proc=result.nodes.find(n=>n.name==='updatefield'); assert.ok(proc);
   assert.match(source.split('\\n').slice(proc.startLine-1,proc.endLine).join('\\n'),/end subroutine UpdateField/i);
   assert.ok(result.nodes.some(n=>n.qualifiedName==='fieldengine::advance::localstep'));
  }
  if(file==='types.f90'){
   assert.ok(result.nodes.some(n=>n.kind==='struct'&&n.name==='state'));
   assert.ok(result.nodes.some(n=>n.kind==='constant'&&n.name==='limit'));
   assert.ok(result.nodes.some(n=>n.qualifiedName==='statemodel::afterinterface'));
  }
 }
 console.log('parser/ranges/case/scopes: passed');
})().catch(e=>{console.error(e);process.exitCode=1});
`);
    run(bundle, [parserProbe], project);
    const cli = path.join(bundle, 'lib/dist/bin/codegraph.js');
    run(bundle, [cli, 'init', project, '--yes'], project);
    const dbProbe = path.join(project, 'db.cjs');
    fs.writeFileSync(dbProbe, `
const assert=require('node:assert/strict'); const {DatabaseSync}=require('node:sqlite');
const db=new DatabaseSync(${JSON.stringify(path.join(project, manifest.indexDirectory, 'codegraph.db'))},{readOnly:true});
const files=db.prepare('SELECT path,errors FROM files').all(); assert.equal(files.length,5); assert.ok(files.every(f=>!f.errors));
const edges=db.prepare("SELECT s.name source,t.name target,e.kind FROM edges e JOIN nodes s ON s.id=e.source JOIN nodes t ON t.id=e.target").all();
for(const [source,target] of [['compute','advance'],['advance','updatefield'],['advance','localstep'],['localstep','updatefield'],['updatefield','energy'],['legacy','updatefield'],['windowsline','updatefield']])
 assert.ok(edges.some(e=>e.kind==='calls'&&e.source===source&&e.target===target),source+' -> '+target);
assert.ok(edges.some(e=>e.kind==='imports'&&e.source==='compute'&&e.target==='fieldengine'));
console.log(JSON.stringify({files:files.length,nodes:db.prepare('SELECT COUNT(*) n FROM nodes').get().n,edges:edges.length})); db.close();
`);
    const counts = JSON.parse(run(bundle, [dbProbe], project).trim());
    const context = run(bundle, [cli, 'context', 'UpdateField', '--max-nodes', '6'], project);
    assert.match(context, /end subroutine UpdateField/i);
    const protocol = await mcp(bundle, project);
    success = true;
    return { passed: true, ...counts, parser: true, sourceRanges: true, caseInsensitive: true,
      fixedFormSample: true, fixedFormComments: true, crlf: true, scopes: true, releaseIntegrity: true, mcp: protocol };
  } finally {
    // 删除范围仅限本次 mkdtemp 创建的测试目录，失败则保留用于诊断。
    if (success && fs.realpathSync(project).startsWith(fs.realpathSync(os.tmpdir()) + path.sep)
      && path.basename(project).startsWith('cgfortran-verify-')) fs.rmSync(project, { recursive: true, maxRetries: 10, retryDelay: 200 });
    else if (!success) console.error(`验证失败，保留临时项目：${project}`);
  }
}
module.exports = { verify, runtime };
if (require.main === module) {
  const bundle = process.argv[2];
  if (!bundle) { console.error('用法：node scripts/fortran/verify.cjs <独立 bundle 目录>'); process.exitCode = 1; }
  else verify(bundle).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
    console.error(error.stack); process.exitCode = 1;
  });
}
