import { bench, describe } from 'vitest';
import { runWorkflow } from '../../workflow';
import { DEFAULT_FREE_TARGET_PROVIDERS } from '../../../shared/constants';
import { filterEventLogByProvider, type EventLogEvent } from '../../diagnostics/eventLog';

describe('Workflow Performance Benchmarks', () => {
  bench('runWorkflow - simple text', async () => {
    await runWorkflow({
      text: 'hello',
      mode: 'free',
      activeProviders: DEFAULT_FREE_TARGET_PROVIDERS,
      checkpoints: false,
    });
  });
});

describe('Event Log Optimization Benchmarks', () => {
  const mockEvents: EventLogEvent[] = Array.from({ length: 2000 }, (_, i) => ({
    ts: Date.now() - i * 1000,
    kind: 'send',
    summary: `test ${i}`,
    provider: i % 2 === 0 ? 'chatgpt' : 'claude',
  }));

  bench('filterEventLogByProvider and recentEvents selection', () => {
    const providerFilter = 'all';
    const filteredEvents = filterEventLogByProvider(mockEvents, providerFilter);
    const result = [];
    for (let i = filteredEvents.length - 1; i >= 0 && result.length < 120; i--) {
      result.push(filteredEvents[i]);
    }
  });

  bench('Legacy recentEvents array manipulation (reverse and slice)', () => {
    const providerFilter = 'all';
    const filteredEvents = filterEventLogByProvider(mockEvents, providerFilter);
    const _result = [...filteredEvents].reverse().slice(0, 120);
  });
});
