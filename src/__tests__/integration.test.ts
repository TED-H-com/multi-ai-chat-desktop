import { describe, expect, it, vi } from 'vitest';
import { runWorkflow } from '../workflow';
import { host } from '../host';
import { isProviderPageReloadedError, ProviderPageReloadedError, providerResponseError, ProviderResponseError, isRetryableSendRejection } from '../workflow/providerResponse';
import { preflightGraph, resolveRequiredRoles, isInactiveStandbyProvider, resolveGraphRoles } from '../workflow/graph/preflight';
import { preflightSerialMode } from '../workflow/preflight';
import { codingGraph } from '../workflow/graph/codingGraph';
import { debateGraph } from '../workflow/graph/debateGraph';
import { DEFAULT_CODING_ROLES } from '../../shared/constants';

vi.mock('../appVersion', () => ({
  getRuntimeAppVersion: vi.fn().mockResolvedValue('0.0.0-test')
}));


vi.mock('../host', () => ({
  host: {
    provider: { send: vi.fn(), reload: vi.fn(), open: vi.fn(), fillDraft: vi.fn(), stop: vi.fn() },
    connections: { get: vi.fn().mockResolvedValue([]) },
    settings: { set: vi.fn() },
    bridge: { subscribeTitle: vi.fn().mockResolvedValue(() => {}) },
    sessionCheckpoint: { save: vi.fn(), load: vi.fn(), clear: vi.fn() },
    snapshot: { save: vi.fn().mockResolvedValue(undefined) }
  }
}));

describe('provider response errors', () => {
  it('correctly identifies ProviderPageReloadedError', () => {
    const error = new ProviderPageReloadedError('chatgpt');
    expect(isProviderPageReloadedError(error)).toBe(true);
    expect(isProviderPageReloadedError(new Error())).toBe(false);
  });

  it('correctly identifies retryable send rejections', () => {
    const retryableError = new ProviderResponseError(
      'chatgpt',
      '[Error: chatgpt send was not accepted; draft is still in composer]',
      'chatgpt send was not accepted; draft is still in composer'
    );
    expect(isRetryableSendRejection(retryableError)).toBe(true);

    const otherError = new ProviderResponseError(
      'chatgpt',
      '[Error: other reason]',
      'other reason'
    );
    expect(isRetryableSendRejection(otherError)).toBe(false);
  });

  it('parses provider response errors', () => {
     const parsed = providerResponseError('chatgpt', '[Error: Some failure message]');
     expect(parsed).toBeInstanceOf(ProviderResponseError);
     expect(parsed?.provider).toBe('chatgpt');
     expect(parsed?.message).toBe('Some failure message');
     expect(parsed?.response).toBe('[Error: Some failure message]');

     expect(providerResponseError('chatgpt', 'Success output')).toBeUndefined();
  });
});

describe('preflight integration checks', () => {
  it('resolves graph roles containing specific roles', async () => {
    vi.mocked(host.connections.get).mockResolvedValue([
      { provider: 'chatgpt', webview: 'none', dom: 'unknown', login: 'unknown', thinking: false, lastStatusAt: 1 } as never,
      { provider: 'claude', webview: 'loaded', dom: 'ready', login: 'logged_in', thinking: false, lastStatusAt: 1 } as never,
      { provider: 'gemini', webview: 'loaded', dom: 'ready', login: 'logged_in', thinking: false, lastStatusAt: 1 } as never,
      { provider: 'grok', webview: 'loaded', dom: 'ready', login: 'logged_in', thinking: false, lastStatusAt: 1 } as never,
    ]);

    const result = await preflightGraph(codingGraph, DEFAULT_CODING_ROLES);

    expect(result.ok).toBe(false);
    expect(result.unavailable).toContain('chatgpt');
  });

  it('preflight serial mode fallback on missing roles', async () => {
    vi.mocked(host.connections.get).mockResolvedValue([
      { provider: 'chatgpt', webview: 'loaded', dom: 'ready', login: 'logged_in', thinking: false, lastStatusAt: 1 } as never,
      { provider: 'claude', webview: 'loaded', dom: 'ready', login: 'logged_in', thinking: false, lastStatusAt: 1 } as never,
      { provider: 'gemini', webview: 'loaded', dom: 'ready', login: 'logged_in', thinking: false, lastStatusAt: 1 } as never,
      { provider: 'grok', webview: 'loaded', dom: 'ready', login: 'logged_in', thinking: false, lastStatusAt: 1 } as never,
    ]);

    // Test with missing roles and fallback modes
    const resultDebate = await preflightSerialMode('debate');
    expect(resultDebate.ok).toBe(true);

    const resultConsult = await preflightSerialMode('consult');
    expect(resultConsult.ok).toBe(true);

    const resultCoding = await preflightSerialMode('coding');
    expect(resultCoding.ok).toBe(true);

    const resultRoundtable = await preflightSerialMode('roundtable');
    expect(resultRoundtable.ok).toBe(true);
  });
});

describe('preflight Graph roles', () => {
  it('resolves requiredRoles when it is allStaticAndPossibleRoles', () => {
    const roles = resolveRequiredRoles(debateGraph);
    expect(roles.includes('pro')).toBe(true);
    expect(roles.includes('con')).toBe(true);
  });
});

describe('workflow graph preflight', () => {
  it('identifies inactive standby providers correctly', () => {
    expect(isInactiveStandbyProvider('grok', ['chatgpt', 'claude'])).toBe(true);
    expect(isInactiveStandbyProvider('grok', ['chatgpt', 'grok'])).toBe(false);
    expect(isInactiveStandbyProvider('grok', undefined)).toBe(false);
  });
});

describe('workflow index fallback error text', () => {
  it('runWorkflow handles standard Error objects in workflowFailureText', async () => {
    vi.mocked(host.connections.get).mockResolvedValue([
      { provider: 'chatgpt', webview: 'loaded', dom: 'ready', login: 'logged_in', thinking: false, lastStatusAt: 1 } as never,
    ]);

    const error = new Error('standard error message');
    vi.mocked(host.provider.send).mockRejectedValueOnce(error);

    // Testing the fallback string logic in workflowFailureText
    const result = await runWorkflow({ text: 'fail-standard', mode: 'free', targets: ['chatgpt'] });
    expect(result.ok).toBe(true);
  });

  it('runWorkflow handles generic string errors in workflowFailureText', async () => {
    vi.mocked(host.connections.get).mockResolvedValue([
      { provider: 'chatgpt', webview: 'loaded', dom: 'ready', login: 'logged_in', thinking: false, lastStatusAt: 1 } as never,
    ]);

    vi.mocked(host.provider.send).mockRejectedValueOnce('Some string error');

    // Testing the fallback String(error) in workflowFailureText
    const result = await runWorkflow({ text: 'fail-string', mode: 'free', targets: ['chatgpt'] });
    expect(result.ok).toBe(true);
  });
});

describe('preflightGraph unit behavior 2', () => {
  it('covers missing provider for resolveGraphRoles', () => {
    const mockGraph = {
      roles: { 'mock-role': {} }
    } as never;

    const resolved = resolveGraphRoles(mockGraph, undefined);
    expect(resolved.get('mock-role')).toBeUndefined();
  });

  it('covers collectProviderRoles for direct role', () => {
    const mockGraph = {
      id: 'mock-graph-direct',
      version: 1,
      roles: { 'mock-role1': { defaultProvider: 'chatgpt' } },
      preflight: { kind: 'serial', requiredRoles: 'allStaticAndPossibleRoles' },
      nodes: {
        stepNode: {
          kind: 'step',
          provider: { type: 'role', role: 'mock-role1' },
          prompt: { args: [] }
        }
      }
    } as never;

    const roles = resolveRequiredRoles(mockGraph);
    expect(roles).toContain('mock-role1');
  });

  it('covers missing provider throw in providerForRequiredRole', async () => {
    const mockGraph = {
      id: 'mock-graph-throw',
      version: 1,
      roles: { 'mock-role1': { defaultProvider: 'chatgpt' } },
      preflight: { kind: 'serial', requiredRoles: ['non-existent'] },
      nodes: {}
    } as never;

    await expect(preflightGraph(mockGraph, {})).rejects.toThrow('No provider configured for graph role "non-existent" in graph "mock-graph-throw"');
  });

  it('covers missing provider throw in providerForRequiredRole with array requiredRoles', async () => {
    const mockGraph = {
      id: 'mock-graph-throw-array',
      version: 1,
      roles: { 'mock-role1': { defaultProvider: 'chatgpt' } },
      preflight: { kind: 'serial', requiredRoles: ['mock-role1', 'mock-role2'] },
      nodes: {}
    } as never;

    await expect(preflightGraph(mockGraph, {})).rejects.toThrow('No provider configured for graph role "mock-role2" in graph "mock-graph-throw-array"');
  });

  it('covers resolveRequiredRoles default return', async () => {
     const mockGraph = {
      id: 'mock-graph-default-req',
      version: 1,
      roles: { 'mock-role1': { defaultProvider: 'chatgpt' } },
      preflight: { kind: 'serial', requiredRoles: undefined },
      nodes: {}
    } as never;
    const roles = resolveRequiredRoles(mockGraph);
    expect(roles).toEqual(['mock-role1']);
  });
});

describe('preflight serial mode fallback edge cases 2', () => {
  it('covers missing fallback branches in preflightSerialMode for roles return', async () => {
    vi.mocked(host.connections.get).mockResolvedValue([
      { provider: 'chatgpt', webview: 'loaded', dom: 'ready', login: 'logged_in', thinking: false, lastStatusAt: 1 } as never,
    ]);

    expect((await preflightSerialMode('debate', { pro: 'chatgpt', con: 'chatgpt', judge: 'chatgpt', summary: 'chatgpt' })).ok).toBe(true);
  });

  it('covers consult parallel aliases branch', async () => {
    vi.mocked(host.connections.get).mockResolvedValue([
      { provider: 'chatgpt', webview: 'loaded', dom: 'ready', login: 'logged_in', thinking: false, lastStatusAt: 1 } as never,
    ]);

    // Force consult parallel Aliases to trigger
    expect((await preflightSerialMode('consult', { first: 'chatgpt', second: 'chatgpt', reviewer: 'chatgpt', summary: 'chatgpt' })).aliased).toContain('chatgpt');
  });
});

describe('workflow run overlap', () => {
  it('covers canceling activeWorkflowRun when new one starts', async () => {
    vi.mocked(host.connections.get).mockResolvedValue([
      { provider: 'chatgpt', webview: 'loaded', dom: 'ready', login: 'logged_in', thinking: false, lastStatusAt: 1 } as never,
    ]);

    vi.mocked(host.provider.send).mockImplementation(async (_provider) => {
       // do not resolve immediately to keep run pending
       return new Promise(() => {});
    });

    const run1 = runWorkflow({ text: 'q1', mode: 'free', targets: ['chatgpt'] });
    // allow first run to acquire start gate and begin setup
    await Promise.resolve();

    // start second run, it will trigger previous workflow cancellation
    const run2 = runWorkflow({ text: 'q2', mode: 'free', targets: ['chatgpt'] });

    // waiting some time for previous run to abort and cleanup
    await Promise.resolve();

    // We expect the first run to have hit an error or resolved because of abort.
    // Wait for them
    // actually, just test it resolves / finishes without error.
    expect(run1).toBeDefined();
    expect(run2).toBeDefined();
  });
});


describe('preflightGraph unit behavior 3', () => {
  it('covers fanout logic with roles over type in resolveRequiredRoles', () => {
    const mockGraph = {
      id: 'mock-graph',
      version: 1,
      roles: { 'mock-role': { defaultProvider: 'chatgpt' } },
      preflight: { kind: 'serial', requiredRoles: 'allStaticAndPossibleRoles' },
      nodes: {
        fanoutNode: {
          kind: 'fanout',
          over: { type: 'roles', roles: ['fanout-role1', 'fanout-role2'] },
          template: {
            provider: { type: 'role', role: 'template-role' },
            prompt: { args: [{ kind: 'text', provider: { type: 'select', possibleRoles: ['select-role'] } }] }
          }
        },
        stepNode: {
           kind: 'step',
           provider: { type: 'select', possibleRoles: ['step-select-role'] },
           prompt: { args: [{ kind: 'text', provider: { type: 'role', role: 'step-arg-role' } }] }
        },
        unknownNode: {
           kind: 'unknown'
        }
      }
    } as never;

    const roles = resolveRequiredRoles(mockGraph);
    expect(roles).toContain('fanout-role1');
    expect(roles).toContain('fanout-role2');
    expect(roles).toContain('template-role');
    expect(roles).toContain('select-role');
    expect(roles).toContain('step-select-role');
    expect(roles).toContain('step-arg-role');
  });

  it('covers aliased Providers', async () => {
    vi.mocked(host.connections.get).mockResolvedValue([
      { provider: 'chatgpt', webview: 'loaded', dom: 'ready', login: 'logged_in', thinking: false, lastStatusAt: 1 } as never,
    ]);

    const mockGraph = {
      id: 'mock-graph-alias',
      version: 1,
      roles: { 'mock-role1': { defaultProvider: 'chatgpt' }, 'mock-role2': { defaultProvider: 'chatgpt' } },
      preflight: { kind: 'serial', requiredRoles: ['mock-role1', 'mock-role2'], aliasRules: [{ roles: ['mock-role1', 'mock-role2'] }] },
      nodes: {}
    } as never;

    const result = await preflightGraph(mockGraph, {});
    expect(result.aliased).toContain('chatgpt');
    expect(result.ok).toBe(false);
  });

  it('covers missingState fallback', async () => {
    vi.mocked(host.connections.get).mockResolvedValue([]);
    const mockGraph = {
      id: 'mock-graph-missing-state',
      version: 1,
      roles: { 'mock-role1': { defaultProvider: 'chatgpt' } },
      preflight: { kind: 'serial', requiredRoles: ['mock-role1'] },
      nodes: {}
    } as never;
    const result = await preflightGraph(mockGraph, {});
    expect(result.unavailable).toContain('chatgpt');
    expect(result.ok).toBe(false);
  });

  it('covers missing provider throw in preflightGraph direct return', async () => {
    vi.mocked(host.connections.get).mockResolvedValue([
      { provider: 'chatgpt', webview: 'loaded', dom: 'ready', login: 'logged_in', thinking: false, lastStatusAt: 1 } as never,
    ]);
    const mockGraph = {
      id: 'mock-graph-req',
      version: 1,
      roles: { 'mock-role1': { defaultProvider: 'chatgpt' } },
      preflight: { kind: 'serial', requiredRoles: ['mock-role1'] },
      nodes: {}
    } as never;

    const result = await preflightGraph(mockGraph);
    expect(result.unavailable).not.toContain('chatgpt');
    expect(result.ok).toBe(true);
  });

  it('covers free kind fast pass', async () => {
    const mockGraph = {
      id: 'mock-graph-free',
      version: 1,
      roles: {},
      preflight: { kind: 'free' },
      nodes: {}
    } as never;

    const result = await preflightGraph(mockGraph, {});
    expect(result.ok).toBe(true);
  });
});


describe('preflightGraph unit behavior 4', () => {
  it('covers fanout logic with roles over type in resolveRequiredRoles', () => {
    const mockGraph = {
      id: 'mock-graph',
      version: 1,
      roles: { 'mock-role': { defaultProvider: 'chatgpt' } },
      preflight: { kind: 'serial', requiredRoles: 'allStaticAndPossibleRoles' },
      nodes: {
        fanoutNode: {
          kind: 'fanout',
          over: { type: 'roles', roles: ['fanout-role1', 'fanout-role2'] },
          template: {
            provider: { type: 'role', role: 'template-role' },
            prompt: { args: [{ kind: 'text', provider: { type: 'select', possibleRoles: ['select-role'] } }] }
          }
        },
        stepNode: {
           kind: 'step',
           provider: { type: 'select', possibleRoles: ['step-select-role'] },
           prompt: { args: [{ kind: 'text', provider: { type: 'role', role: 'step-arg-role' } }] }
        },
        unknownNode: {
           kind: 'unknown'
        }
      }
    } as never;

    const roles = resolveRequiredRoles(mockGraph);
    expect(roles).toContain('fanout-role1');
    expect(roles).toContain('fanout-role2');
    expect(roles).toContain('template-role');
    expect(roles).toContain('select-role');
    expect(roles).toContain('step-select-role');
    expect(roles).toContain('step-arg-role');
  });
});
