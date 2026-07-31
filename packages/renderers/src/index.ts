import type { ValidationResult } from '@wdmcd/core';
import pc from 'picocolors';

export type OutputFormat = 'text' | 'json';

export interface InitView {
  root: string;
  created: string[];
  existing: string[];
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
