import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BridgeMessage } from '../../shared/types';
import { POLL_PULL_MS } from '../../shared/constants';
import { onBridgeMessage, resetBusForTests } from '../bridge/bus';
import {
  DONE_WATCHDOG_MS,
  handleTitleMessage,
  pullProvider,
  resetBridgePullForTests,
  resetProviderBootState,
  setProviderAwaiting,
  startBridgePull,
} from '../bridge/pull';
import { host } from '../host';

vi.mock('../host', () => ({
  host: {
    provider: { evalWithCallback: vi.fn(), eval: vi.fn(), stop: vi.fn() },
    bridge: { subscribeTitle: vi.fn() },
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function title(bootId = 'boot-a', payload?: unknown): void {
  handleTitleMessage({ v: 1, action: 'STATUS_REPORT', provider: 'chatgpt', bootId, payload, transport: 'title' });
}

function done(bootId = 'boot-a', mid = 1): BridgeMessage {
  return { v: 1, action: 'RESPONSE_DONE', provider: 'chatgpt', bootId, mid, payload: 'answer' };
}

describe('pull lifecycle races', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
    resetBusForTests();
    resetBridgePullForTests();
    vi.mocked(host.provider.evalWithCallback).mockResolvedValue('[]');
    vi.mocked(host.provider.eval).mockResolvedValue(undefined);
    vi.mocked(host.provider.stop).mockResolvedValue(undefined);
  });

  afterEach(() => {
    resetBusForTests();
    resetBridgePullForTests();
    vi.useRealTimers();
  });

  it('keeps polling a new turn when the previous DONE acknowledgement completes late', async () => {
    const ack = deferred<void>();
    vi.mocked(host.provider.eval).mockReturnValueOnce(ack.promise);
    vi.mocked(host.provider.evalWithCallback).mockResolvedValueOnce(JSON.stringify([done()]));
    title();
    setProviderAwaiting('chatgpt', true);
    const received = deferred<void>();
    onBridgeMessage((message) => {
      if (message.action === 'RESPONSE_DONE') received.resolve();
    });
    const pull = pullProvider('chatgpt');
    await received.promise;
    setProviderAwaiting('chatgpt', false);
    setProviderAwaiting('chatgpt', true);
    ack.resolve();
    await pull;

    await vi.advanceTimersByTimeAsync(POLL_PULL_MS);
    expect(host.provider.evalWithCallback).toHaveBeenCalledTimes(2);
  });

  it('does not acknowledge an old document against the replacement document outbox', async () => {
    const ack = vi.fn();
    const replacementWindow = { __MAC_BRIDGE__: { bootId: 'boot-b', ackBulk: ack } };
    vi.mocked(host.provider.evalWithCallback).mockResolvedValueOnce(JSON.stringify([done()]));
    vi.mocked(host.provider.eval).mockImplementation(async (_provider, script) => {
      // Navigation can occur in the native webview before its new title reaches the control pane.
      new Function('window', script)(replacementWindow);
    });
    title();
    await pullProvider('chatgpt');

    expect(ack).not.toHaveBeenCalled();
  });

  it('ignores a pull failure from a document that has already reloaded', async () => {
    const callback = deferred<string>();
    vi.mocked(host.provider.evalWithCallback).mockReturnValue(callback.promise);
    const messages: BridgeMessage[] = [];
    onBridgeMessage((message) => messages.push(message));
    title();
    const pull = pullProvider('chatgpt');
    title('boot-b');
    callback.reject(new Error('old webview closed'));
    await vi.advanceTimersByTimeAsync(1_000);
    await pull;

    expect(messages).not.toContainEqual(expect.objectContaining({ payload: { bridge: 'degraded', reason: 'pull_failed' } }));
    vi.mocked(host.provider.evalWithCallback).mockResolvedValue('[]');
    await pullProvider('chatgpt');
    expect(host.provider.evalWithCallback).toHaveBeenCalledTimes(3);
  });

  it('discards an in-flight batch invalidated by an explicit boot reset', async () => {
    const callback = deferred<string>();
    vi.mocked(host.provider.evalWithCallback).mockReturnValueOnce(callback.promise);
    const messages: BridgeMessage[] = [];
    onBridgeMessage((message) => messages.push(message));
    title();
    const pull = pullProvider('chatgpt');
    resetProviderBootState('chatgpt');
    callback.resolve(JSON.stringify([done()]));
    await pull;

    expect(messages.filter((message) => message.transport === 'pull')).toEqual([]);
    expect(host.provider.eval).not.toHaveBeenCalled();
  });

  it('does not let an old DONE watchdog stop a new turn while its forced pull finishes', async () => {
    const callback = deferred<string>();
    const messages: BridgeMessage[] = [];
    onBridgeMessage((message) => messages.push(message));
    title();
    setProviderAwaiting('chatgpt', true);
    title('boot-a', { bulkReady: 1, doneReady: true });
    await vi.advanceTimersByTimeAsync(DONE_WATCHDOG_MS - 1);
    vi.mocked(host.provider.evalWithCallback).mockReturnValueOnce(callback.promise);
    await vi.advanceTimersByTimeAsync(1);

    setProviderAwaiting('chatgpt', false);
    setProviderAwaiting('chatgpt', true);
    callback.resolve('[]');
    await vi.advanceTimersByTimeAsync(0);

    expect(host.provider.stop).not.toHaveBeenCalled();
    expect(messages.filter((message) => message.action === 'RESPONSE_DONE')).toEqual([]);
  });

  it('retries an acknowledgement failure without redelivering its response', async () => {
    const messages: BridgeMessage[] = [];
    onBridgeMessage((message) => messages.push(message));
    title();
    vi.mocked(host.provider.evalWithCallback).mockResolvedValue(JSON.stringify([done()]));
    vi.mocked(host.provider.eval).mockRejectedValueOnce(new Error('ack failed'));

    await expect(pullProvider('chatgpt')).resolves.toBeUndefined();
    await pullProvider('chatgpt');
    expect(messages.filter((message) => message.action === 'RESPONSE_DONE')).toHaveLength(1);
    expect(host.provider.eval).toHaveBeenCalledTimes(2);
  });

  it('skips malformed outbox entries and still delivers the valid response', async () => {
    const messages: BridgeMessage[] = [];
    onBridgeMessage((message) => messages.push(message));
    title();
    vi.mocked(host.provider.evalWithCallback).mockResolvedValueOnce(JSON.stringify([
      null, 42, {}, { ...done(), mid: -1 }, { ...done(), mid: 1.5 },
      { ...done(), v: 2 }, { ...done(), action: 'STATUS_REPORT' }, done(),
    ]));

    await expect(pullProvider('chatgpt')).resolves.toBeUndefined();
    expect(messages.filter((message) => message.transport === 'pull')).toEqual([
      { ...done(), transport: 'pull' },
    ]);
  });

  it('can subscribe again after a failed title subscription and disposes once', async () => {
    const cleanup = vi.fn();
    vi.mocked(host.bridge.subscribeTitle)
      .mockRejectedValueOnce(new Error('listener unavailable'))
      .mockResolvedValue(cleanup);

    await expect(startBridgePull()).rejects.toThrow('listener unavailable');
    const dispose = await startBridgePull();
    dispose();
    dispose();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('shares concurrent subscriptions and keeps listening until the last caller disposes', async () => {
    const cleanup = vi.fn();
    const subscription = deferred<() => void>();
    vi.mocked(host.bridge.subscribeTitle).mockReturnValueOnce(subscription.promise);
    const first = startBridgePull();
    const second = startBridgePull();
    subscription.resolve(cleanup);
    const [disposeFirst, disposeSecond] = await Promise.all([first, second]);
    expect(host.bridge.subscribeTitle).toHaveBeenCalledTimes(1);
    disposeFirst();
    expect(cleanup).not.toHaveBeenCalled();
    disposeSecond();
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('shares concurrent forced retries after a normal pull completes', async () => {
    setProviderAwaiting('chatgpt', true);
    const callback = deferred<string>();
    vi.mocked(host.provider.evalWithCallback).mockReturnValueOnce(callback.promise);
    const normal = pullProvider('chatgpt');
    const first = pullProvider('chatgpt', { force: true });
    const second = pullProvider('chatgpt', { force: true });
    callback.resolve('[]');
    await Promise.all([normal, first, second]);
    expect(host.provider.evalWithCallback).toHaveBeenCalledTimes(2);
  });

  it('acknowledges the consumed messages in the same document', async () => {
    const ack = vi.fn();
    const currentWindow = { __MAC_BRIDGE__: { bootId: 'boot-a', ackBulk: ack } };
    vi.mocked(host.provider.evalWithCallback).mockResolvedValueOnce(JSON.stringify([done('boot-a', 7)]));
    vi.mocked(host.provider.eval).mockImplementation(async (_provider, script) => {
      new Function('window', script)(currentWindow);
    });
    title();
    await pullProvider('chatgpt');
    expect(ack).toHaveBeenCalledExactlyOnceWith(7);
  });
});
