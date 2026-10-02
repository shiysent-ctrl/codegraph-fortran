/**
 * 功能：将 Fortran Tree-sitter AST 转换为 CodeGraph 符号、包含关系和调用引用。
 * 输入：语法节点及 ExtractorContext；输出：模块、过程、类型与待解析引用。
 * 依赖：随包固定的 tree-sitter-fortran WASM 与通用提取器接口。
 * 名称按 Fortran 的大小写不敏感规则归一化；源码位置保留原样。
 */
import type { Node as SyntaxNode } from 'web-tree-sitter';
import type { NodeKind } from '../../types';
import type { ExtractorContext, LanguageExtractor } from '../tree-sitter-types';

const scopes: Record<string, readonly [string, NodeKind]> = {
  module: ['module_statement', 'module'],
  submodule: ['submodule_statement', 'module'],
  program: ['program_statement', 'namespace'],
  function: ['function_statement', 'function'],
  subroutine: ['subroutine_statement', 'function'],
  interface: ['interface_statement', 'interface'],
  derived_type_definition: ['derived_type_statement', 'struct'],
  block_data: ['block_data_statement', 'namespace'],
};
const canonical = (value: string): string => value.trim().toLowerCase();
const field = (node: SyntaxNode, name: string): SyntaxNode | null => node.childForFieldName(name);
const nameChild = (node: SyntaxNode): SyntaxNode | undefined | null => field(node, 'name') ||
  node.namedChildren.find(child => ['name', 'type_name', 'identifier'].includes(child.type));

function reference(ctx: ExtractorContext, node: SyntaxNode, name: string): void {
  const fromNodeId = ctx.nodeStack[ctx.nodeStack.length - 1];
  if (!fromNodeId || !name) return;
  ctx.addUnresolvedReference({ fromNodeId, referenceName: canonical(name),
    referenceKind: 'calls', line: node.startPosition.row + 1, column: node.startPosition.column });
}

export const fortranExtractor: LanguageExtractor = {
  preParse(source, filePath = '') {
    // 固定格式首列 C/c/* 是整行注释；等长替换 ASCII，保持字节和行列位置。
    if (!/\.(f|for|ftn)$/i.test(filePath)) return source;
    return source.replace(/^[cC*]/gm, '!');
  },
  functionTypes: [], classTypes: [], methodTypes: [], interfaceTypes: [],
  structTypes: [], enumTypes: [], typeAliasTypes: [], variableTypes: [],
  importTypes: ['use_statement'], callTypes: [],
  nameField: 'name', bodyField: 'body', paramsField: 'parameters',
  extractImport(node) {
    const moduleName = field(node, 'module_name') || node.namedChildren.find(
      child => ['module_name', 'identifier', 'name'].includes(child.type));
    return moduleName ? { moduleName: canonical(moduleName.text), signature: node.text.trim() } : null;
  },
  visitNode(node, ctx) {
    const scope = scopes[node.type];
    if (scope) {
      const statement = node.namedChildren.find(child => child.type === scope[0]);
      const name = statement && nameChild(statement);
      // 使用完整作用域范围，避免 explore 仅返回声明头部。
      const created = name && statement && ctx.createNode(scope[1], canonical(name.text), node, {
        signature: statement.text.trim(),
        endLine: Math.max(node.startPosition.row + 1,
          node.endPosition.row + (node.endPosition.column === 0 ? 0 : 1)),
      });
      if (created) ctx.pushScope(created.id);
      try {
        for (const child of node.namedChildren) {
          if (child.id === statement?.id || child.type.startsWith('end_')) continue;
          ctx.visitNode(child);
        }
      } finally {
        // 匿名接口不创建作用域，不能弹出外层模块。
        if (created) ctx.popScope();
      }
      return true;
    }
    if (node.type === 'subroutine_call' || node.type === 'call_expression') {
      const callee = field(node, 'subroutine') || field(node, 'function') || node.namedChild(0);
      // 类型绑定调用仅保留最终方法名，不推断运行时动态分派。
      if (callee) reference(ctx, node, callee.text.split('%').pop() || '');
      for (const child of node.namedChildren) {
        if (child.id !== callee?.id) ctx.visitNode(child);
      }
      return true;
    }
    if (node.type === 'variable_declaration') {
      const type = field(node, 'type');
      const constant = node.namedChildren.some(child => child.type === 'type_qualifier' && /\bparameter\b/i.test(child.text));
      for (const child of node.namedChildren) {
        if (!['identifier', 'data_declarator', 'init_declarator', 'sized_declarator',
          'pointer_init_declarator', 'coarray_declarator'].includes(child.type)) continue;
        const name = child.type === 'identifier' ? child : nameChild(child);
        if (name) ctx.createNode(constant ? 'constant' : 'variable', canonical(name.text), child,
          { signature: `${type?.text || ''} :: ${name.text}`.trim() });
        if (child.type !== 'identifier') for (const part of child.namedChildren) {
          if (part.id !== name?.id) ctx.visitNode(part);
        }
      }
      return true;
    }
    return false;
  },
};
