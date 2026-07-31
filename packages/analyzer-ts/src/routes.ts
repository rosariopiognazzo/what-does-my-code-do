import { normalizeProjectPath, type RouteFact } from '@wdmcd/core';
import ts from 'typescript';

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']);

function lineOf(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function decoratorsOf(node: ts.Node): readonly ts.Decorator[] {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}

function decoratorCall(decorator: ts.Decorator): ts.CallExpression | undefined {
  return ts.isCallExpression(decorator.expression) ? decorator.expression : undefined;
}

function decoratorName(decorator: ts.Decorator): string | undefined {
  const expression = decoratorCall(decorator)?.expression ?? decorator.expression;
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return undefined;
}

function firstStringArgument(call: ts.CallExpression | undefined): string {
  const argument = call?.arguments[0];
  return argument && ts.isStringLiteralLike(argument) ? argument.text : '';
}

function routeJoin(...parts: string[]): string {
  const joined = parts.filter(Boolean).join('/').replaceAll('\\', '/').replace(/\/+/g, '/');
  return `/${joined}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

function routeFromSegments(segments: string[]): string {
  const routeSegments = segments
    .filter((segment) => !/^\(.*\)$/.test(segment))
    .map((segment) => segment.replace(/^\[\.\.\.(.+)\]$/, ':$1*').replace(/^\[(.+)\]$/, ':$1'));
  return routeJoin(...routeSegments);
}

function exportedNames(sourceFile: ts.SourceFile): Array<{ name: string; line: number }> {
  const names: Array<{ name: string; line: number }> = [];
  for (const statement of sourceFile.statements) {
    const modifiers = ts.canHaveModifiers(statement) ? ts.getModifiers(statement) : undefined;
    if (!modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
    if (
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
      statement.name
    ) {
      names.push({ name: statement.name.text, line: lineOf(sourceFile, statement) });
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          names.push({ name: declaration.name.text, line: lineOf(sourceFile, declaration) });
        }
      }
    }
  }
  return names;
}

function detectNextRoutes(sourceFile: ts.SourceFile, sourcePath: string): RouteFact[] {
  const normalized = normalizeProjectPath(sourcePath);
  const segments = normalized.split('/');
  const fileName = segments.at(-1) ?? '';
  const exports = exportedNames(sourceFile);

  const appIndex = segments.lastIndexOf('app');
  if (appIndex >= 0 && /^route\.[cm]?[jt]sx?$/.test(fileName)) {
    const routePath = routeFromSegments(segments.slice(appIndex + 1, -1));
    return exports
      .filter((item) => HTTP_METHODS.has(item.name))
      .map((item) => ({
        method: item.name,
        routePath,
        sourcePath: normalized,
        framework: 'next-app' as const,
        handler: item.name,
        line: item.line,
      }));
  }

  const pagesIndex = segments.lastIndexOf('pages');
  if (pagesIndex >= 0 && segments[pagesIndex + 1] === 'api') {
    const routeSegments = segments.slice(pagesIndex + 1);
    const pageName = fileName.replace(/\.[cm]?[jt]sx?$/, '');
    if (pageName === 'index') routeSegments.pop();
    else routeSegments[routeSegments.length - 1] = pageName;
    return [
      {
        method: 'ANY',
        routePath: routeFromSegments(routeSegments),
        sourcePath: normalized,
        framework: 'next-pages',
        line: 1,
      },
    ];
  }

  return [];
}

function detectExpressRoutes(sourceFile: ts.SourceFile, sourcePath: string): RouteFact[] {
  const routes: RouteFact[] = [];

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const receiver = node.expression.expression.getText(sourceFile);
      const method = node.expression.name.text.toUpperCase();
      const firstArgument = node.arguments[0];
      if (
        (receiver === 'app' || receiver === 'router') &&
        HTTP_METHODS.has(method) &&
        firstArgument &&
        ts.isStringLiteralLike(firstArgument)
      ) {
        routes.push({
          method,
          routePath: routeJoin(firstArgument.text),
          sourcePath,
          framework: 'express',
          line: lineOf(sourceFile, node),
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return routes;
}

function detectNestRoutes(sourceFile: ts.SourceFile, sourcePath: string): RouteFact[] {
  const routes: RouteFact[] = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isClassDeclaration(statement)) continue;
    const controller = decoratorsOf(statement).find(
      (decorator) => decoratorName(decorator) === 'Controller',
    );
    if (!controller) continue;
    const prefix = firstStringArgument(decoratorCall(controller));

    for (const member of statement.members) {
      const routeDecorator = decoratorsOf(member).find((decorator) =>
        HTTP_METHODS.has(decoratorName(decorator) ?? ''),
      );
      if (!routeDecorator) continue;
      const method = decoratorName(routeDecorator);
      if (!method) continue;
      const suffix = firstStringArgument(decoratorCall(routeDecorator));
      routes.push({
        method,
        routePath: routeJoin(prefix, suffix),
        sourcePath,
        framework: 'nest',
        handler: member.name?.getText(sourceFile),
        line: lineOf(sourceFile, member),
      });
    }
  }
  return routes;
}

export function detectRoutes(sourceFile: ts.SourceFile, sourcePath: string): RouteFact[] {
  return [
    ...detectNextRoutes(sourceFile, sourcePath),
    ...detectExpressRoutes(sourceFile, sourcePath),
    ...detectNestRoutes(sourceFile, sourcePath),
  ];
}
