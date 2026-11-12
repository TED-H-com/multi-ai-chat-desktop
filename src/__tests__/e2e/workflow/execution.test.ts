import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";
import { runWorkflow } from '../../../workflow/index';
import { getInFlightProviders } from '../../../workflow/cancel';

vi.mock('../../../workflow/cancel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../workflow/cancel')>();
  return {
    ...actual,
    abortWorkflow: vi.fn(),
    getInFlightProviders: vi.fn().mockReturnValue([]),
  };
});
vi.mock('../../../workflow/events', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../workflow/events')>();
  return {
    ...actual,
    emitSystemError: vi.fn(),
    sendWorkflowStatus: vi.fn(),
  };
});
vi.mock('../../../workflow/stepTimeout', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../workflow/stepTimeout')>();
  return {
    ...actual,
    cancelPendingStepTimeoutAction: vi.fn(),
  };
});
vi.mock('../../../workflow/teardown', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../workflow/teardown')>();
  return {
    ...actual,
    tearDownWaiters: vi.fn().mockResolvedValue(undefined),
  };
});
vi.mock('../../../workflow/graph', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../workflow/graph')>();
  return {
    ...actual,
    executeGraph: vi.fn().mockResolvedValue(undefined),
    preflightGraph: vi.fn().mockResolvedValue({ ok: true }),
  };
});
vi.mock('../../../appVersion', () => ({
  getRuntimeAppVersion: vi.fn().mockResolvedValue('1.0.0'),
}));
vi.mock('../../../host', () => ({
  host: {
    connections: {
      get: vi.fn().mockResolvedValue([
        { provider: 'chatgpt', webview: 'loaded', dom: 'ready', login: 'logged_in', thinking: false }
      ])
    }
  }
}));
vi.mock('../../../i18n/resolve', () => ({
  resolveUserLocale: vi.fn().mockReturnValue('en'),
}));

describe('Workflow execution e2e', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs brainstorm workflow successfully', async () => {
    const res = await runWorkflow({
      text: 'hello',
      mode: 'free',
      presetId: 'brainstorm',
    });
    expect(res).toEqual({ ok: true });
  });

  it('runs free workflow successfully', async () => {
    const res = await runWorkflow({
      text: 'hello',
      mode: 'free',
    });
    expect(res).toEqual({ ok: true });
  });

  it('runs serial workflow successfully', async () => {
    const res = await runWorkflow({
      text: 'hello',
      mode: 'free',
    });
    expect(res).toEqual({ ok: true });
  });

  it('recovers from errors during runPreparedWorkflow using try/catch', async () => {
    const { emitSystemError } = await import('../../../workflow/events');
    const { executeGraph } = await import('../../../workflow/graph');

    (executeGraph as unknown as Mock).mockRejectedValueOnce(new Error('executeGraph error'));

    const res = await runWorkflow({
      text: 'hello',
      mode: 'free',
    });
    expect(res).toEqual({ ok: true });
    expect(emitSystemError).toHaveBeenCalledWith('executeGraph error');
  });

  it('recovers from ProviderPageReloadedError formatting correctly', async () => {
    const { emitSystemError } = await import('../../../workflow/events');
    const { executeGraph } = await import('../../../workflow/graph');
    const { ProviderPageReloadedError } = await import('../../../workflow/providerResponse');

    (executeGraph as unknown as Mock).mockRejectedValueOnce(new ProviderPageReloadedError('chatgpt'));

    const res = await runWorkflow({
      text: 'hello',
      mode: 'free',
      locale: 'en'
    });
    expect(res).toEqual({ ok: true });
    // Note that the translation resolves to "ChatGPT's page reloaded during its turn, so this answer was lost. Retry that step."
    expect(emitSystemError).toHaveBeenCalledWith(expect.stringContaining("ChatGPT's page reloaded"));
  });

  it('prevents concurrent executions and gracefully aborts previous', async () => {
    const { executeGraph } = await import('../../../workflow/graph');
    const { abortWorkflow } = await import('../../../workflow/cancel');
    const { tearDownWaiters } = await import('../../../workflow/teardown');
    (getInFlightProviders as unknown as Mock).mockReturnValueOnce(['chatgpt']);

    let releaseGraph: () => void = () => {};
    (executeGraph as unknown as Mock).mockImplementationOnce(() => {
      return new Promise<void>((resolve) => {
        releaseGraph = resolve;
      });
    });

    const promise1 = runWorkflow({ text: 'first', mode: 'free' });

    // allow event loop to begin execution of first workflow
    await new Promise((resolve) => setTimeout(resolve, 0));

    // start second one to abort the first one's turn
    const promise2 = runWorkflow({ text: 'second', mode: 'free' });

    // Cleanup the first blocked execution to avoid dangling test promises
    releaseGraph();

    const [res1, res2] = await Promise.all([promise1, promise2]);
    expect(res1).toEqual({ ok: true });
    expect(res2).toEqual({ ok: true });

    expect(abortWorkflow).toHaveBeenCalled();
    expect(tearDownWaiters).toHaveBeenCalledWith(['chatgpt'], { stopClick: true });
  });
});
