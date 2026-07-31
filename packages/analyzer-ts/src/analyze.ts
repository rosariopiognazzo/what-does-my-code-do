import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  TechnicalAnalysisSchema,
  contentHash,
  normalizeProjectPath,
  parseJsonText,
  shortHash,
  type CallFact,
  type DependencyFact,
  type Diagnostic,
  type ImportFact,
  type SourceFileFact,
  type SymbolFact,
  type WdmcdConfig,
} from '@wdmcd/core';
import fg from 'fast-glob';
import ts from 'typescript';

import { detectRoutes } from './routes.js';

const ANALYZER_CACHE_VERSION = 2 as const;

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface AnalysisCache {
  version: typeof ANALYZER_CACHE_VERSION;
  key: string;
  analysis: unknown;
}

async function optionalText(filePath: string): Promise<string | undefined> {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return undefined;
  }
}

async function readAnalysisCache(filePath: string, key: string) {
  try {
    const cache = parseJsonText(await readFile(filePath, 'utf8')) as AnalysisCache;
    if (cache.version !== ANALYZER_CACHE_VERSION || cache.key !== key) return undefined;
    const parsed = TechnicalAnalysisSchema.safeParse(cache.analysis);
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

async function writeAnalysisCache(filePath: string, key: string, analysis: unknown): Promise<void> {
  const directory = path.dirname(filePath);
  const temporary = path.join(directory, `.analysis.${randomUUID()}.tmp`);
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(
      temporary,
      `${JSON.stringify({ version: ANALYZER_CACHE_VERSION, key, analysis } satisfies AnalysisCache)}\n`,
      'utf8',
    );
    await rename(temporary, filePath);
  } finally {
    await rm(temporary, { force: true });
  }
}

function isInsideRoot(root: string, filePath: string): boolean {
  const relative = path.relative(root, filePath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function isExported(node: ts.Node): boolean {
  return Boolean(
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
  );
}

function symbolKind(node: ts.Node): SymbolFact['kind'] {
  if (ts.isClassDeclaration(node)) return 'class';
  if (ts.isFunctionDeclaration(node)) return 'function';
  if (ts.isInterfaceDeclaration(node)) return 'interface';
  if (ts.isTypeAliasDeclaration(node)) return 'type';
  if (ts.isVariableDeclaration(node)) return 'variable';
  if (ts.isEnumDeclaration(node)) return 'enum';
  return 'unknown';
}

function collectSymbols(sourceFile: ts.SourceFile): SymbolFact[] {
  const symbols: SymbolFact[] = [];
  for (const statement of sourceFile.statements) {
    if (
      (ts.isClassDeclaration(statement) ||
        ts.isFunctionDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name
    ) {
      symbols.push({
        name: statement.name.text,
        kind: symbolKind(statement),
        line: lineOf(sourceFile, statement),
        exported: isExported(statement),
      });
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        symbols.push({
          name: declaration.name.text,
          kind: 'variable',
          line: lineOf(sourceFile, declaration),
          exported: isExported(statement),
        });
      }
    }
  }
  return symbols;
}

function importNames(node: ts.ImportDeclaration): string[] {
  const clause = node.importClause;
  if (!clause) return [];
  const names: string[] = [];
  if (clause.name) names.push(clause.name.text);
  if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) {
    names.push(clause.namedBindings.name.text);
  }
  if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
    names.push(...clause.namedBindings.elements.map((element) => element.name.text));
  }
  return names;
}

function resolveProjectImport(
  specifier: string,
  sourceFile: ts.SourceFile,
  root: string,
  options: ts.CompilerOptions,
  selectedFiles: Set<string>,
): string | undefined {
  const result = ts.resolveModuleName(
    specifier,
    sourceFile.fileName,
    options,
    ts.sys,
  ).resolvedModule;
  if (!result || !isInsideRoot(root, result.resolvedFileName)) return undefined;
  const relative = normalizeProjectPath(path.relative(root, result.resolvedFileName)).replace(
    /\.d\.ts$/,
    '.ts',
  );
  return selectedFiles.has(relative) ? relative : undefined;
}

function collectImports(
  sourceFile: ts.SourceFile,
  root: string,
  options: ts.CompilerOptions,
  selectedFiles: Set<string>,
): ImportFact[] {
  const imports: ImportFact[] = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteralLike(statement.moduleSpecifier))
      continue;
    const specifier = statement.moduleSpecifier.text;
    const resolvedPath = resolveProjectImport(specifier, sourceFile, root, options, selectedFiles);
    imports.push({
      specifier,
      names: importNames(statement),
      line: lineOf(sourceFile, statement),
      ...(resolvedPath ? { resolvedPath } : {}),
    });
  }
  return imports;
}

function collectCalls(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
  root: string,
  selectedFiles: Set<string>,
): CallFact[] {
  const calls: CallFact[] = [];
  const seen = new Set<string>();

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const target = ts.isPropertyAccessExpression(node.expression)
        ? node.expression.name
        : node.expression;
      let symbol = checker.getSymbolAtLocation(target);
      if (symbol && (symbol.flags & ts.SymbolFlags.Alias) !== 0)
        symbol = checker.getAliasedSymbol(symbol);
      const declaration = symbol?.declarations?.[0];
      const targetFile = declaration?.getSourceFile().fileName;
      if (symbol && targetFile && isInsideRoot(root, targetFile)) {
        const resolvedPath = normalizeProjectPath(path.relative(root, targetFile));
        if (
          selectedFiles.has(resolvedPath) &&
          resolvedPath !== normalizeProjectPath(path.relative(root, sourceFile.fileName))
        ) {
          const line = lineOf(sourceFile, node);
          const key = `${symbol.name}:${resolvedPath}:${line}`;
          if (!seen.has(key)) {
            seen.add(key);
            calls.push({ callee: symbol.name, line, resolvedPath });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return calls;
}

function diagnosticMessage(diagnostic: ts.Diagnostic): string {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ');
}

function readCompilerOptions(root: string, diagnostics: Diagnostic[]): ts.CompilerOptions {
  const configPath = path.join(root, 'tsconfig.json');
  if (!ts.sys.fileExists(configPath)) {
    return {
      allowJs: true,
      checkJs: false,
      jsx: ts.JsxEmit.Preserve,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
    };
  }

  const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
  if (loaded.error) {
    diagnostics.push({
      level: 'warning',
      code: 'TSCONFIG_READ',
      message: diagnosticMessage(loaded.error),
      path: 'tsconfig.json',
    });
    return { allowJs: true, noEmit: true, skipLibCheck: true };
  }
  const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, root);
  for (const error of parsed.errors) {
    diagnostics.push({
      level: 'warning',
      code: 'TSCONFIG_PARSE',
      message: diagnosticMessage(error),
      path: 'tsconfig.json',
    });
  }
  return { ...parsed.options, allowJs: true, checkJs: false, noEmit: true, skipLibCheck: true };
}

function globPatterns(config: WdmcdConfig): { patterns: string[]; ignore: string[] } {
  const extension = '**/*.{ts,tsx,js,jsx,mts,cts,mjs,cjs}';
  const patterns = config.include.map((directory) =>
    directory === '.'
      ? extension
      : `${normalizeProjectPath(directory).replace(/\/$/, '')}/${extension}`,
  );
  const ignore = config.exclude.flatMap((directory) => {
    const normalized = normalizeProjectPath(directory).replace(/^\//, '').replace(/\/$/, '');
    return [`${normalized}/**`, `**/${normalized}/**`];
  });
  ignore.push('**/*.d.ts');
  return { patterns, ignore };
}

async function readDependencies(root: string): Promise<DependencyFact[]> {
  const packageJson = parseJsonText(
    await readFile(path.join(root, 'package.json'), 'utf8'),
  ) as PackageJson;
  const dependencies = Object.entries(packageJson.dependencies ?? {}).map(([name, version]) => ({
    name,
    version,
    development: false,
  }));
  const development = Object.entries(packageJson.devDependencies ?? {}).map(([name, version]) => ({
    name,
    version,
    development: true,
  }));
  return [...dependencies, ...development].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

export async function analyzeTypescriptProject(root: string, config: WdmcdConfig) {
  const resolvedRoot = path.resolve(root);
  const diagnostics: Diagnostic[] = [];
  const { patterns, ignore } = globPatterns(config);
  const relativeFiles = (
    await fg(patterns, {
      cwd: resolvedRoot,
      absolute: false,
      onlyFiles: true,
      unique: true,
      ignore,
    })
  )
    .map(normalizeProjectPath)
    .sort();
  const sources = new Map<string, string>();
  for (const relativePath of relativeFiles) {
    try {
      sources.set(relativePath, await readFile(path.join(resolvedRoot, relativePath), 'utf8'));
    } catch (error) {
      diagnostics.push({
        level: 'warning',
        code: 'SOURCE_UNREADABLE',
        message: error instanceof Error ? error.message : String(error),
        path: relativePath,
      });
    }
  }
  const dependencies = await readDependencies(resolvedRoot);
  const cacheKey = contentHash({
    version: ANALYZER_CACHE_VERSION,
    analyzer: ts.version,
    config,
    tsconfig: await optionalText(path.join(resolvedRoot, 'tsconfig.json')),
    packageJson: await optionalText(path.join(resolvedRoot, 'package.json')),
    files: [...sources.entries()].map(([filePath, source]) => [filePath, shortHash(source)]),
  });
  const cachePath = path.join(resolvedRoot, '.wdmcd', 'cache', 'analysis.json');
  const cached = await readAnalysisCache(cachePath, cacheKey);
  if (cached) {
    return TechnicalAnalysisSchema.parse({
      ...cached,
      dependencies,
      cache: { hit: true, files: cached.files.length },
    });
  }
  const selectedFiles = new Set(relativeFiles);
  const compilerOptions = readCompilerOptions(resolvedRoot, diagnostics);
  const absoluteFiles = relativeFiles.map((file) => path.join(resolvedRoot, file));
  const program = ts.createProgram({ rootNames: absoluteFiles, options: compilerOptions });
  const checker = program.getTypeChecker();
  const fileFacts: SourceFileFact[] = [];

  for (const relativePath of relativeFiles) {
    const absolutePath = path.join(resolvedRoot, relativePath);
    const sourceFile = program.getSourceFile(absolutePath);
    if (!sourceFile) {
      diagnostics.push({
        level: 'warning',
        code: 'SOURCE_UNREADABLE',
        message: 'TypeScript could not load this source file.',
        path: relativePath,
      });
      continue;
    }
    try {
      const source = sources.get(relativePath);
      if (source === undefined) continue;
      fileFacts.push({
        path: relativePath,
        hash: shortHash(source),
        isTest: /(?:^|\/)(?:__tests__\/.*|.*\.(?:test|spec))\.[cm]?[jt]sx?$/.test(relativePath),
        symbols: collectSymbols(sourceFile),
        imports: collectImports(sourceFile, resolvedRoot, compilerOptions, selectedFiles),
        calls: collectCalls(sourceFile, checker, resolvedRoot, selectedFiles),
        routes: detectRoutes(sourceFile, relativePath),
      });
    } catch (error) {
      diagnostics.push({
        level: 'warning',
        code: 'SOURCE_ANALYSIS_FAILED',
        message: error instanceof Error ? error.message : String(error),
        path: relativePath,
      });
    }
  }

  for (const diagnostic of program.getSyntacticDiagnostics()) {
    const diagnosticPath = diagnostic.file
      ? normalizeProjectPath(path.relative(resolvedRoot, diagnostic.file.fileName))
      : undefined;
    diagnostics.push({
      level: 'warning',
      code: 'TYPESCRIPT_SYNTAX',
      message: diagnosticMessage(diagnostic),
      ...(diagnosticPath ? { path: diagnosticPath } : {}),
    });
  }

  const analysis = TechnicalAnalysisSchema.parse({
    files: fileFacts,
    dependencies,
    diagnostics,
    cache: { hit: false, files: fileFacts.length },
  });
  try {
    await writeAnalysisCache(cachePath, cacheKey, analysis);
  } catch {
    // Cache failures never invalidate an otherwise valid scan.
  }
  return analysis;
}
