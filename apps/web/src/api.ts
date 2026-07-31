import type {
  CapabilityCorrection,
  CapabilityDetail,
  CapabilitySummary,
  ComponentOption,
  ImpactReport,
  OverviewView,
} from '@wdmcd/core';

interface ApiErrorBody {
  message?: string;
  details?: string[];
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    const details = body.details?.length ? ` ${body.details.join(' ')}` : '';
    throw new Error(`${body.message ?? `Request failed (${response.status}).`}${details}`);
  }
  return (await response.json()) as T;
}

export const api = {
  overview: () => request<OverviewView>('/api/project'),
  capabilities: () => request<CapabilitySummary[]>('/api/capabilities'),
  capability: (id: string) =>
    request<CapabilityDetail>(`/api/capabilities/${encodeURIComponent(id)}`),
  components: (query: string) =>
    request<ComponentOption[]>(`/api/components?query=${encodeURIComponent(query)}&limit=50`),
  impact: (base: string, head: string) =>
    request<ImpactReport>(
      `/api/impact?base=${encodeURIComponent(base)}&head=${encodeURIComponent(head)}`,
    ),
  confirm: (id: string, correction: CapabilityCorrection = {}) =>
    request<{ file: string; rescanned: boolean }>(
      `/api/capabilities/${encodeURIComponent(id)}/confirm`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(correction),
      },
    ),
};

export function sourceUrl(path: string, line?: number): string {
  const query = new URLSearchParams({ path });
  if (line) query.set('line', String(line));
  return `/api/source?${query.toString()}`;
}
