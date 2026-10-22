import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import ts from 'typescript';

export interface ImportViolation { file: string; line: number; specifier: string; reason: string; }
type Dependency = { specifier?: string; line: number };
const slash = (value: string) => value.replaceAll('\\', '/');
const inside = (file: string, directory: string) => file.startsWith(`${directory}/`);

/** Read imports structurally: comments, strings and type-only imports cannot hide a boundary. */
export function dependencies(file: string, source: string): Dependency[] {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const result: Dependency[] = [];
  const add = (node: ts.Node, value?: ts.Expression | ts.TypeNode) => {
    let literal: ts.Node | undefined = value;
    if (literal && ts.isLiteralTypeNode(literal)) literal = literal.literal;
    result.push({ line: tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1,
      ...(literal && ts.isStringLiteralLike(literal) ? { specifier: literal.text } : {}) });
  };
  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) add(node, node.moduleSpecifier);
    else if (ts.isExportDeclaration(node) && node.moduleSpecifier) add(node, node.moduleSpecifier);
    else if (ts.isImportTypeNode(node)) add(node, node.argument);
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) add(node, node.moduleReference.expression);
    else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword
      || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) add(node, node.arguments[0]);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return result;
}

function feature(file: string, base: string): string | undefined {
  return inside(file, base) ? file.slice(base.length + 1).split('/')[0] : undefined;
}
function publicEntry(file: string, base: string, name: string, styles = false): boolean {
  return file === `${base}/${name}/index` || file === `${base}/${name}` || (styles && file === `${base}/${name}/index.css`);
}
function withoutExtension(file: string): string {
  return file.replace(/\.(?:[cm]?[jt]sx?)$/, '');
}

/** Rules apply to process boundaries everywhere and to each extracted module in full. */
export function inspectImports(root: string, absoluteFile: string, source: string): ImportViolation[] {
  const file = slash(relative(root, absoluteFile));
  const inRenderer = inside(file, 'src/renderer');
  const inShared = inside(file, 'src/shared');
  const ownMainModule = feature(file, 'src/main/modules');
  const inIpc = inside(file, 'src/main/ipc');
  const ownUiFeature = feature(file, 'src/renderer/features');
  const voiceCore = file === 'src/renderer/features/voice/voice-session.ts';
  const restricted = inRenderer || inShared || inIpc || Boolean(ownMainModule);
  const result: ImportViolation[] = [];
  for (const dependency of dependencies(file, source)) {
    const { specifier, line } = dependency;
    let reason: string | undefined;
    if (specifier === undefined) {
      if (restricted) reason = 'Computed module loading is not permitted across checked boundaries.';
    } else if (!specifier.startsWith('.')) {
      if (inRenderer && !/^(?:react(?:\/.*)?|react-dom(?:\/.*)?|lucide-react)$/.test(specifier)) reason = 'Renderer packages must be browser UI dependencies; privileged adapters belong in main.';
      if (inShared) reason = 'Shared contracts must not depend on platform, UI or SDK packages.';
      if (ownMainModule && specifier !== 'node:crypto') reason = 'Application modules use ports for platform and SDK dependencies.';
      if (inIpc) reason = 'IPC handlers use typed ports rather than Electron, Node or SDK packages.';
      if (voiceCore) reason = 'The voice state machine must not depend on React or browser adapters.';
    } else {
      const target = withoutExtension(slash(relative(root, resolve(dirname(absoluteFile), specifier))));
      if (inRenderer && !inside(target, 'src/renderer') && !inside(target, 'src/shared')) reason = 'Renderer may only import renderer code and shared contracts.';
      if (inShared && !inside(target, 'src/shared')) reason = 'Shared contracts may only import other shared contracts.';
      if (inIpc && !inside(target, 'src/main/ipc') && !inside(target, 'src/shared')) reason = 'IPC handlers depend on shared contracts and local ports, not controllers or concrete adapters.';
      const targetMainModule = feature(target, 'src/main/modules');
      if (ownMainModule && !inside(target, `src/main/modules/${ownMainModule}`)
        && !inside(target, 'src/shared')
        && !(targetMainModule && publicEntry(target, 'src/main/modules', targetMainModule))) reason = 'Application modules cannot reach legacy controllers or platform adapters; use a port.';
      if (targetMainModule && targetMainModule !== ownMainModule
        && !publicEntry(target, 'src/main/modules', targetMainModule)) reason = 'Import the public index of another application module.';
      const targetUiFeature = feature(target, 'src/renderer/features');
      if (targetUiFeature && targetUiFeature !== ownUiFeature
        && !publicEntry(target, 'src/renderer/features', targetUiFeature, true)) reason = 'Import the public index of another UI feature.';
      if (voiceCore && !inside(target, 'src/shared')
        && target !== 'src/renderer/speech-queue') reason = 'The voice state machine uses injected browser capabilities, not UI or browser implementations.';
    }
    if (reason) result.push({ file, line, specifier: specifier ?? '<computed>', reason });
  }
  return result;
}

export function checkArchitecture(root: string): ImportViolation[] {
  function sources(directory: string): string[] {
    return readdirSync(directory).sort().flatMap(entry => {
      const file = join(directory, entry);
      return statSync(file).isDirectory() ? sources(file) : /\.(?:ts|tsx)$/.test(extname(file)) ? [file] : [];
    });
  }
  return sources(join(root, 'src')).flatMap(file => inspectImports(root, file, readFileSync(file, 'utf8')));
}
