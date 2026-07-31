import type { CapabilityDetail, ImpactReport, OverviewView, ValidationResult } from '@wdmcd/core';
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

export function renderOverview(view: OverviewView, format: OutputFormat): string {
  if (format === 'json') return JSON.stringify(view, null, 2);
  const ref = view.project.scannedRef ?? 'working tree';
  const commit = view.project.commit ? ` @ ${view.project.commit.slice(0, 12)}` : '';
  const lines = [pc.bold(`Project: ${view.project.name}`), `Scanned ref: ${ref}${commit}`];
  if (view.project.purpose) lines.push(`Purpose: ${view.project.purpose}`);
  lines.push('', pc.bold('Capabilities'));
  if (view.capabilities.length === 0) lines.push('- No capability was identified.');
  for (const [index, capability] of view.capabilities.entries()) {
    lines.push(
      `${index + 1}. ${capability.name}  ${capability.confidence}  ${capability.components} components  ${capability.tests} tests`,
    );
  }
  if (view.openQuestions.length > 0) {
    lines.push('', pc.bold('Open questions'));
    for (const question of view.openQuestions) lines.push(`- ${question.question}`);
  }
  const first = view.capabilities[0];
  if (first)
    lines.push('', 'Next', `- wdmcd capability "${first.name}"`, '- wdmcd impact main...feature');
  return lines.join('\n');
}

function componentLines(view: CapabilityDetail): string[] {
  const groups: Array<
    [string, CapabilityDetail['components'][keyof CapabilityDetail['components']]]
  > = [
    ['Entry', view.components.entry],
    ['Orchestration', view.components.orchestration],
    ['Data', view.components.data],
    ['Integrations', view.components.integrations],
    ['Tests', view.components.tests],
    ['Other', view.components.other],
  ];
  const lines: string[] = [];
  for (const [label, nodes] of groups) {
    if (nodes.length === 0) continue;
    lines.push(`${label}: ${nodes.map((node) => node.name).join(', ')}`);
  }
  return lines;
}

export function renderCapability(view: CapabilityDetail, format: OutputFormat): string {
  if (format === 'json') return JSON.stringify(view, null, 2);
  const lines = [pc.bold(`Capability: ${view.name}`), `State: ${view.confidence}`];
  if (view.description) lines.push(`Purpose: ${view.description}`);
  if (view.rule) lines.push(`Why: ${view.rule}`);
  if (view.flows.length > 0) {
    lines.push('', pc.bold('Flow'));
    for (const flow of view.flows) lines.push(flow.steps.join(' -> '));
  }
  lines.push('', pc.bold('Components'), ...componentLines(view));
  lines.push('', pc.bold('Evidence'));
  for (const item of view.evidence.slice(0, 12)) {
    const location = item.path
      ? `${item.path}${item.lineStart ? `:${item.lineStart}` : ''}`
      : item.sourceType;
    lines.push(`- ${location}  ${item.kind}${item.note ? `  ${item.note}` : ''}`);
  }
  if (view.needsReview.length > 0) {
    lines.push('', pc.bold('Needs review'), ...view.needsReview.map((item) => `- ${item}`));
  }
  return lines.join('\n');
}

export function renderImpact(view: ImpactReport, format: OutputFormat): string {
  if (format === 'json') return JSON.stringify(view, null, 2);
  const lines = [
    pc.bold(`Impact: ${view.range}`),
    `${view.files.length} changed files, ${view.relations.added.length} added and ${view.relations.removed.length} removed relations`,
  ];
  lines.push('', pc.bold('Capability directly affected'));
  if (view.direct.length === 0) lines.push('- None identified from the available evidence.');
  for (const impact of view.direct) lines.push(`- ${impact.name}: ${impact.reason}`);
  if (view.downstream.length > 0) {
    lines.push('', pc.bold('Potential downstream impact'));
    for (const impact of view.downstream) {
      lines.push(`- ${impact.name}: ${impact.chain.join(' -> ')}`);
    }
  }
  if (view.tests.length > 0) {
    lines.push('', pc.bold('Linked tests'), ...view.tests.map((test) => `- ${test.name}`));
  }
  if (view.questions.length > 0) {
    lines.push(
      '',
      pc.bold('Review questions'),
      ...view.questions.map((question) => `- ${question}`),
    );
  }
  return lines.join('\n');
}
