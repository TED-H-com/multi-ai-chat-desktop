import { describe, expect, it, beforeEach } from 'vitest';
import { getSnapshotAdapterVersions, resetAdapterVersionsForTests } from '../workflow/snapshot/adapterVersions';
import { publishBridgeMessage } from '../bridge/bus';
import type { BridgeMessage } from '../../shared/types';

describe('adapterVersions', () => {
  beforeEach(() => {
    resetAdapterVersionsForTests();
  });

  it('updates adapter version when a valid ADAPTER_UPDATE message is published', () => {
    publishBridgeMessage({
      v: 1,
      action: 'ADAPTER_UPDATE',
      provider: 'chatgpt',
      payload: { adapterVersion: 42 },
    } as unknown as BridgeMessage);

    const versions = getSnapshotAdapterVersions(['chatgpt', 'claude']);
    expect(versions).toEqual({ chatgpt: 42 });
  });

  it('ignores non-ADAPTER_UPDATE messages', () => {
    publishBridgeMessage({
      v: 1,
      action: 'READY',
      provider: 'chatgpt',
      payload: { adapterVersion: 42 },
    } as unknown as BridgeMessage);

    const versions = getSnapshotAdapterVersions(['chatgpt']);
    expect(versions).toEqual({});
  });

  it('ignores messages without a valid provider', () => {
    publishBridgeMessage({
      v: 1,
      action: 'ADAPTER_UPDATE',
      payload: { adapterVersion: 42 },
    } as unknown as BridgeMessage);

    publishBridgeMessage({
      v: 1,
      action: 'ADAPTER_UPDATE',
      provider: 'invalid_provider',
      payload: { adapterVersion: 42 },
    } as unknown as BridgeMessage);

    const versions = getSnapshotAdapterVersions(['chatgpt']);
    expect(versions).toEqual({});
  });

  it('ignores invalid payloads', () => {
    const invalidPayloads = [
      null,
      undefined,
      [],
      'string',
      42,
      {}, // missing adapterVersion
      { adapterVersion: '42' }, // non-numeric
      { adapterVersion: Infinity }, // non-finite
      { adapterVersion: NaN }, // non-finite
    ];

    for (const payload of invalidPayloads) {
      publishBridgeMessage({
        v: 1,
        action: 'ADAPTER_UPDATE',
        provider: 'chatgpt',
        payload,
      } as unknown as BridgeMessage);
    }

    const versions = getSnapshotAdapterVersions(['chatgpt']);
    expect(versions).toEqual({});
  });
});