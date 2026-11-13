import { describe, expect, it, vi, beforeEach } from 'vitest';
import { runWorkflow } from '../../workflow';
import { host } from '../../host';
import { publishBridgeMessage } from '../../bridge/bus';
import type { ProviderState, BridgeMessage, AIProvider } from '../../../shared/types';
import { resetBusForTests } from '../../bridge/bus';
import { resetBridgePullForTests } from '../../bridge/pull';
import { resetSnapshotRecorderForTests } from '../../workflow/snapshot/recorder';
import { resetCancelState } from '../../workflow/cancel';

vi.mock('../../host', () => ({
  host: {
    provider: { send: vi.fn(), stop: vi.fn(() => Promise.resolve()), eval: vi.fn(), evalWithCallback: vi.fn(), fill: vi.fn() },
    connections: { get: vi.fn() },
    bridge: { subscribeTitle: vi.fn() },
    sessionCheckpoint: { save: vi.fn(), load: vi.fn(), clear: vi.fn() },
    snapshot: { save: vi.fn(), load: vi.fn() }
  }
}));

const providers: AIProvider[] = ['chatgpt', 'claude', 'gemini', 'grok'];

function state(provider: AIProvider, sendable = true): ProviderState {
  return {
    provider,
    webview: sendable ? 'loaded' : 'none',
    dom: sendable ? 'ready' : 'unknown',
    login: sendable ? 'logged_in' : 'unknown',
    thinking: false,
    lastStatusAt: 1,
  };
}

function done(provider: AIProvider, payload = 'final'): BridgeMessage {
  return { v: 1, action: 'RESPONSE_DONE', provider, payload, transport: 'pull' };
}

describe('core workflow e2e', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    resetBusForTests();
    resetBridgePullForTests();
    resetSnapshotRecorderForTests();
    resetCancelState();
  });

  it('completes a full brainstorm workflow with persistence and state recovery', async () => {
    vi.mocked(host.connections.get).mockResolvedValue(providers.map((provider) => state(provider)));

    vi.mocked(host.provider.send).mockImplementation(async (provider) => {
      publishBridgeMessage(done(provider, `${provider}-response`));
    });

    const run = runWorkflow({ text: 'brainstorming session', mode: 'free', presetId: 'brainstorm', activeProviders: providers, snapshotPersistence: true });

    await expect(run).resolves.toEqual({ ok: true });

    expect(vi.mocked(host.provider.send)).toHaveBeenCalled();
  });
});
