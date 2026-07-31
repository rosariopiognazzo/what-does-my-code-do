import { describe, expect, it } from 'vitest';

import { WDMCD_MODEL_VERSION, WDMCD_VERSION } from '@wdmcd/core';

describe('workspace foundation', () => {
  it('exposes a stable product and model version', () => {
    expect(WDMCD_VERSION).toBe('0.1.0');
    expect(WDMCD_MODEL_VERSION).toBe(1);
  });
});
