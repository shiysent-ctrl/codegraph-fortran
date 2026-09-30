/** Fortran extraction contract: pinned real grammar, scopes, source ranges and resolved graph. */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createHash } from 'node:crypto';
import { CodeGraph } from '../src';
import { extractFromSource, scanDirectory } from '../src/extraction';
import { detectLanguage, loadGrammarsForLanguages, readGrammarWasmBytes } from '../src/extraction/grammars';
import { fortranExtractor } from '../src/extraction/languages/fortran';
import { LANGUAGES } from '../src/types';

const fixtures = path.join(__dirname, 'fixtures', 'fortran');
const read = (name: string) => fs.readFileSync(path.join(fixtures, name), 'utf8');
beforeAll(async () => { await loadGrammarsForLanguages(['fortran']); });

describe('Fortran extraction', () => {
  it.each(['f', 'f90', 'f95', 'f03', 'f08', 'for', 'ftn', 'fpp', 'F', 'F90', 'F95', 'F03', 'F08', 'FOR', 'FTN', 'FPP'])(
    'detects .%s', extension => { expect(detectLanguage(`src/field.${extension}`)).toBe('fortran'); });

  it('ships a loadable vendored grammar and appends the language without shifting old indices', async () => {
    const bytes = (await readGrammarWasmBytes(['fortran'])).fortran;
    expect(bytes.byteLength).toBeGreaterThan(10_000);
    const receipt = JSON.parse(fs.readFileSync(path.join(__dirname, '../third_party/fortran/manifest.json'), 'utf8'));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(receipt.sha256);
    expect(LANGUAGES.at(-1)).toBe('fortran');
    expect(LANGUAGES.indexOf('unknown')).toBe(41);
  });

  it('keeps complete routine bodies and nested qualified names', () => {
    const source = read('fields.F90');
    const result = extractFromSource('fields.F90', source);
    expect(result.errors).toEqual([]);
    const update = result.nodes.find(n => n.name === 'updatefield')!;
    expect(update.kind).toBe('function');
    expect(source.split(/\r?\n/).slice(update.startLine - 1, update.endLine).join('\n')).toMatch(/end subroutine UpdateField/i);
    expect(result.nodes.some(n => n.qualifiedName === 'fieldengine::advance::localstep')).toBe(true);
    expect(result.unresolvedReferences).toContainEqual(expect.objectContaining({ referenceName: 'updatefield', referenceKind: 'calls' }));
  });

  it('preserves the module scope after anonymous interfaces and captures types/constants', () => {
    const result = extractFromSource('types.f90', read('types.f90'));
    expect(result.errors).toEqual([]);
    expect(result.nodes).toContainEqual(expect.objectContaining({ name: 'state', kind: 'struct' }));
    expect(result.nodes).toContainEqual(expect.objectContaining({ name: 'limit', kind: 'constant' }));
    expect(result.nodes).toContainEqual(expect.objectContaining({ qualifiedName: 'statemodel::afterinterface' }));
  });

  it('normalizes only fixed-form comment markers with stable UTF-8 offsets and CRLF', () => {
    const source = 'C 中文注释\r\nc comment\r\n* comment\r\n      SUBROUTINE Legacy()\r\n      CALL Target()\r\n      END\r\n';
    const normalized = fortranExtractor.preParse!(source, 'legacy.F');
    expect(Buffer.byteLength(normalized)).toBe(Buffer.byteLength(source));
    expect(normalized.split('\n')).toHaveLength(source.split('\n').length);
    expect(fortranExtractor.preParse!(source, 'free.f90')).toBe(source);
    const result = extractFromSource('legacy.F', source);
    expect(result.errors).toEqual([]);
    expect(result.nodes).toContainEqual(expect.objectContaining({ name: 'legacy', startLine: 4 }));
    expect(result.unresolvedReferences).toContainEqual(expect.objectContaining({ referenceName: 'target', line: 5 }));
  });

  it('captures submodules, named interfaces, programs and block data', () => {
    for (const [source, name, kind] of [
      ['submodule (Parent) Child\ncontains\nsubroutine Step()\nend subroutine Step\nend submodule Child\n', 'child', 'module'],
      ['module M\ninterface Generic\nsubroutine F()\nend subroutine F\nend interface Generic\nend module M\n', 'generic', 'interface'],
      ['program Compute\nend program Compute\n', 'compute', 'namespace'],
      ['block data Storage\ninteger :: x\ncommon /Values/ x\nend block data Storage\n', 'storage', 'namespace'],
    ] as const) {
      const result = extractFromSource('sample.f90', source);
      expect(result.nodes).toContainEqual(expect.objectContaining({ name, kind }));
    }
  });
});

describe('Fortran graph integration', () => {
  let dir: string | undefined;
  let cg: CodeGraph | undefined;
  afterEach(() => {
    cg?.destroy(); cg = undefined;
    if (dir) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    dir = undefined;
  });
  it('resolves imports and mixed-case calls across files and re-indexes without duplicate nodes', async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codegraph-fortran-test-'));
    for (const name of fs.readdirSync(fixtures)) fs.copyFileSync(path.join(fixtures, name), path.join(dir, name));
    expect(scanDirectory(dir)).toContain('fields.F90');
    cg = CodeGraph.initSync(dir, { config: { exclude: [] } });
    await cg.indexAll(); cg.resolveReferences();
    const nodes = scanDirectory(dir).flatMap(file => cg!.getNodesInFile(file));
    for (const [from, to] of [['compute', 'advance'], ['advance', 'updatefield'], ['advance', 'localstep'],
      ['localstep', 'updatefield'], ['updatefield', 'energy'], ['legacy', 'updatefield']]) {
      const source = nodes.find(n => n.name === from)!;
      expect(cg.getCallees(source.id).map(c => c.node.name)).toContain(to);
    }
    const compute = nodes.find(n => n.name === 'compute')!;
    expect(cg.getOutgoingEdges(compute.id)).toContainEqual(expect.objectContaining({ kind: 'imports' }));
    await cg.indexAll(); cg.resolveReferences();
    const again = scanDirectory(dir).flatMap(file => cg!.getNodesInFile(file));
    expect(again.map(n => n.id).sort()).toEqual(nodes.map(n => n.id).sort());
  });
});
