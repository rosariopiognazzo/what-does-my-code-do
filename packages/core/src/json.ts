export function parseJsonText(content: string): unknown {
  return JSON.parse(content.replace(/^\uFEFF/, '')) as unknown;
}
