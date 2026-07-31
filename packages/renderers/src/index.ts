import type { ValidationResult } from '@wdmcd/core';
import pc from 'picocolors';

export type OutputFormat = 'text' | 'json';

export interface InitView {
  root: string;
  created: string[];
  existing: string[];
}

export interface ScanView {
  project: string;
  ref: string;
  commit: string;
  snapshotId: string;
  contentHash: string;
  files: number;
  nodes: number;
  edges: number;
  routes: number;
  tests: number;
  diagnostics: Array<{
    level: 'warning' | 'error';
    code: string;
    message: string;
    path?: string | undefined;
  }>;
}

export function parseOutputFormat(value: string): OutputFormat {
  if (value === 'text' || value === 'json') return value;
  throw new Error(`Unsupported format "${value}". Use text or json.`);
}

export function renderInit(view: InitView, format: OutputFormat): string {
  if (format === 'json') return JSON.stringify(view, null, 2);

  const lines = [pc.bold('WDMCD initialized'), `Project: ${view.root}`];
  if (view.created.length > 0)
    lines.push('', 'Created', ...view.created.map((file) => `- ${file}`));
  if (view.existing.length > 0) {
    lines.push('', 'Already present', ...view.existing.map((file) => `- ${file}`));
  }
  lines.push('', 'Next: wdmcd scan');
  return lines.join('\n');
}

export function renderValidation(view: ValidationResult, format: OutputFormat): string {
  if (format === 'json') return JSON.stringify(view, null, 2);
  if (view.issues.length === 0) return `${pc.green('Valid')} ${view.root}`;

  const lines = [
    view.valid ? pc.yellow('Valid with warnings') : pc.red('Validation failed'),
    view.root,
    '',
  ];
  for (const issue of view.issues) {
    const marker = issue.level === 'error' ? pc.red('error') : pc.yellow('warning');
    const location = issue.path ? `${issue.file}:${issue.path}` : issue.file;
    lines.push(`${marker} ${location}`, `  ${issue.message}`);
  }
  return lines.join('\n');
}

export function renderScan(view: ScanView, format: OutputFormat): string {
  if (format === 'json') return JSON.stringify(view, null, 2);
  const lines = [
    pc.bold(`Scanned ${view.project}`),
    `Ref: ${view.ref} @ ${view.commit.slice(0, 12)}`,
    `Model: ${view.files} files, ${view.nodes} nodes, ${view.edges} relations`,
    `Routes: ${view.routes}  Tests: ${view.tests}`,
  ];
  if (view.diagnostics.length > 0) {
    lines.push('', pc.yellow(`Diagnostics (${view.diagnostics.length})`));
    for (const diagnostic of view.diagnostics.slice(0, 5)) {
      lines.push(`- ${diagnostic.path ? `${diagnostic.path}: ` : ''}${diagnostic.message}`);
    }
    if (view.diagnostics.length > 5)
      lines.push(`- ${view.diagnostics.length - 5} more; run wdmcd validate.`);
  }
  lines.push('', 'Next: wdmcd overview');
  return lines.join('\n');
}
