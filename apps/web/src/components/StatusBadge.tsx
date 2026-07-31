import type { EvidenceKind } from '@wdmcd/core';

export function StatusBadge({ value }: { value: EvidenceKind }) {
  return <span className={`status-badge status-${value}`}>{value}</span>;
}
