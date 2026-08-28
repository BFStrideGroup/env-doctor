import path from 'node:path';
import ts from 'typescript';
import { EnvReference, LanguageDetector } from '../../core/models';

const EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']);
const VITE_BUILTINS = new Set(['MODE', 'BASE_URL', 'PROD', 'DEV', 'SSR']);

function languageFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext.includes('ts')) return 'typescript';
  return 'javascript';
}

function scriptKindFor(filePath: string): ts.ScriptKind {
  switch (path.extname(filePath).toLowerCase()) {
    case '.tsx':
      return ts.ScriptKind.TSX;
    case '.jsx':
      return ts.ScriptKind.JSX;
    case '.ts':
    case '.mts':
    case '.cts':
      return ts.ScriptKind.TS;
    default:
      return ts.ScriptKind.JS;
  }
}

function isProcessEnv(node: ts.Node): boolean {
  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'process' &&
    node.name.text === 'env'
  );
}

function isImportMetaEnv(node: ts.Node): boolean {
  if (!ts.isPropertyAccessExpression(node) || node.name.text !== 'env') return false;
  const expression = node.expression;
  return (
    ts.isMetaProperty(expression) &&
    expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
    expression.name.text === 'meta'
  );
}

function ignoreAt(sourceFile: ts.SourceFile, source: string, node: ts.Node): boolean {
  const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  const lines = source.split(/\r?\n/);
  const current = lines[pos.line] ?? '';
  const previous = pos.line > 0 ? lines[pos.line - 1] : '';
  return /ENV_DOCTOR_IGNORE(?:\s|$)/.test(current) || /ENV_DOCTOR_IGNORE(?:\s|$)/.test(previous);
}

function hasImmediateFallback(node: ts.Node): boolean {
  const parent = node.parent;
  return (
    ts.isBinaryExpression(parent) &&
    parent.left === node &&
    (parent.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
      parent.operatorToken.kind === ts.SyntaxKind.BarBarToken)
  );
}

function makeReference(
  sourceFile: ts.SourceFile,
  source: string,
  filePath: string,
  node: ts.Node,
  name: string,
  accessType: string,
  confidence: 'high' | 'medium' | 'low' = 'high',
  dynamic = false,
  publicVar = false,
  optional = false,
): EnvReference {
  const p = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return {
    name,
    file: filePath,
    line: p.line + 1,
    column: p.character + 1,
    language: languageFor(filePath),
    accessType,
    confidence,
    dynamic,
    public: publicVar,
    optional,
    ignored: ignoreAt(sourceFile, source, node),
  };
}

export class JsTsDetector implements LanguageDetector {
  readonly id = 'javascript-typescript';

  supports(filePath: string): boolean {
    return EXTENSIONS.has(path.extname(filePath).toLowerCase());
  }

  async detectReferences(source: string, filePath: string): Promise<EnvReference[]> {
    const sourceFile = ts.createSourceFile(
      filePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      scriptKindFor(filePath),
    );
    const refs: EnvReference[] = [];

    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAccessExpression(node)) {
        if (isProcessEnv(node.expression)) {
          const name = node.name.text;
          refs.push(
            makeReference(
              sourceFile,
              source,
              filePath,
              node,
              name,
              'process.env.property',
              'high',
              false,
              name.startsWith('NEXT_PUBLIC_'),
              hasImmediateFallback(node),
            ),
          );
        } else if (isImportMetaEnv(node.expression)) {
          const name = node.name.text;
          if (VITE_BUILTINS.has(name)) {
            ts.forEachChild(node, visit);
            return;
          }
          refs.push(
            makeReference(
              sourceFile,
              source,
              filePath,
              node,
              name,
              'import.meta.env.property',
              'high',
              false,
              name.startsWith('VITE_'),
              hasImmediateFallback(node),
            ),
          );
        }
      } else if (ts.isElementAccessExpression(node)) {
        if (isProcessEnv(node.expression)) {
          const arg = node.argumentExpression;
          if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) {
            const name = arg.text;
            refs.push(
              makeReference(
                sourceFile,
                source,
                filePath,
                node,
                name,
                'process.env.element',
                'high',
                false,
                name.startsWith('NEXT_PUBLIC_'),
                hasImmediateFallback(node),
              ),
            );
          } else {
            refs.push(
              makeReference(
                sourceFile,
                source,
                filePath,
                node,
                '<dynamic>',
                'process.env.dynamic',
                'low',
                true,
              ),
            );
          }
        } else if (isImportMetaEnv(node.expression)) {
          const arg = node.argumentExpression;
          if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) {
            const name = arg.text;
            if (!VITE_BUILTINS.has(name)) {
              refs.push(
                makeReference(
                  sourceFile,
                  source,
                  filePath,
                  node,
                  name,
                  'import.meta.env.element',
                  'high',
                  false,
                  name.startsWith('VITE_'),
                  hasImmediateFallback(node),
                ),
              );
            }
          } else {
            refs.push(
              makeReference(
                sourceFile,
                source,
                filePath,
                node,
                '<dynamic>',
                'import.meta.env.dynamic',
                'low',
                true,
              ),
            );
          }
        }
      } else if (
        ts.isVariableDeclaration(node) &&
        ts.isObjectBindingPattern(node.name) &&
        node.initializer &&
        isProcessEnv(node.initializer)
      ) {
        for (const element of node.name.elements) {
          if (element.dotDotDotToken) {
            refs.push(
              makeReference(
                sourceFile,
                source,
                filePath,
                element,
                '<dynamic>',
                'process.env.destructure.rest',
                'low',
                true,
              ),
            );
            continue;
          }
          const property = element.propertyName ?? element.name;
          if (ts.isIdentifier(property) || ts.isStringLiteral(property)) {
            const name = property.text;
            refs.push(
              makeReference(
                sourceFile,
                source,
                filePath,
                element,
                name,
                'process.env.destructure',
                'high',
                false,
                name.startsWith('NEXT_PUBLIC_'),
                Boolean(element.initializer),
              ),
            );
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);

    // De-duplicate when an AST construct could be visited through multiple forms.
    const seen = new Set<string>();
    return refs.filter((ref) => {
      const key = `${ref.file}:${ref.line}:${ref.column}:${ref.name}:${ref.accessType}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
