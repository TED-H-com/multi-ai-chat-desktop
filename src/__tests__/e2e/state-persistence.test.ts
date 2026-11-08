import { describe, expect, it, vi, beforeEach } from 'vitest';
import { persistSnapshotIfEnabled } from '../../workflow/snapshot/persistence';
import { host } from '../../host';
import { ExecutionSnapshot } from '../../workflow/snapshot/types';

vi.mock('../../host', () => ({
  host: {
    snapshot: { save: vi.fn(), load: vi.fn() }
  }
}));

describe('state persistence integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists valid snapshots to host storage', async () => {
    const mockSnapshot: ExecutionSnapshot = {
      snapshotId: 'test-id-123',
      graphId: 'test-graph',
      graphVersion: 1,
      appVersion: '1.0.0',
      createdAt: new Date().toISOString(),
      adapterVersions: {},
      roleMap: {},
      redactionTier: 'full-local',
      userQuestion: { tier: 'full-local', kind: 'inline', text: 'question' },
      steps: [],
      humanEdits: []
    };

    await persistSnapshotIfEnabled(mockSnapshot, { enabled: true, tier: 'metadata-only' });
    expect(host.snapshot.save).toHaveBeenCalled();
  });

  it('does not persist when disabled', async () => {
    const mockSnapshot: ExecutionSnapshot = {
      snapshotId: 'test-id-456',
      graphId: 'test-graph',
      graphVersion: 1,
      appVersion: '1.0.0',
      createdAt: new Date().toISOString(),
      adapterVersions: {},
      roleMap: {},
      redactionTier: 'full-local',
      userQuestion: { tier: 'full-local', kind: 'inline', text: 'question' },
      steps: [],
      humanEdits: []
    };

    await persistSnapshotIfEnabled(mockSnapshot, { enabled: false });
    expect(host.snapshot.save).not.toHaveBeenCalled();
  });
});
