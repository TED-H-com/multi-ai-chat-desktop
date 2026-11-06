import { afterAll, bench, describe, expect } from 'vitest';
import { EVENT_LOG_CAP, filterEventLogByProvider, type EventLogEvent } from '../../diagnostics/eventLog';

describe('Event Log Optimization Benchmarks', () => {
  const mockEvents: EventLogEvent[] = Array.from({ length: EVENT_LOG_CAP }, (_, i) => ({
    ts: i * 1000,
    kind: 'send',
    summary: `test ${i}`,
    provider: i % 2 === 0 ? 'chatgpt' : 'claude',
  }));
  let selectedEvents: EventLogEvent[] = [];

  afterAll(() => {
    expect(selectedEvents).toEqual([...mockEvents].reverse().slice(0, 120));
  });

  bench('filterEventLogByProvider and recentEvents selection', () => {
    const providerFilter = 'all';
    const filteredEvents = filterEventLogByProvider(mockEvents, providerFilter);
    const result = [];
    for (let i = filteredEvents.length - 1; i >= 0 && result.length < 120; i--) {
      result.push(filteredEvents[i]);
    }
    selectedEvents = result;
  });

  bench('Legacy recentEvents array manipulation (reverse and slice)', () => {
    const providerFilter = 'all';
    const filteredEvents = filterEventLogByProvider(mockEvents, providerFilter);
    selectedEvents = [...filteredEvents].reverse().slice(0, 120);
  });
});
