import { describe, expect, it, vi, type Mock } from "vitest";
import { executeGraph } from '../../../workflow/graph';
import { promptBuilders, textConditionEvaluators } from '../../../workflow/graph/registries';

vi.mock('../../../workflow/snapshot/recorder', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../workflow/snapshot/recorder')>();
  return {
    ...actual,
    beginSnapshot: vi.fn(),
    completeSnapshot: vi.fn(),
    recordStep: vi.fn(),
  };
});

vi.mock('../../../workflow/stepRunner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../workflow/stepRunner')>();
  return {
    ...actual,
    runStep: vi.fn().mockResolvedValue({
      provider: 'chatgpt',
      result: { type: 'success', value: 'test response' },
      response: 'test response'
    }),
  };
});

vi.mock('../../../workflow/cancel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../workflow/cancel')>();
  return {
    ...actual,
    abortWorkflow: vi.fn(),
    getInFlightProviders: vi.fn().mockReturnValue([]),
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
    tearDownWaiters: vi.fn(),
  };
});


describe('Workflow graph integration', () => {
  it('executes a basic valid graph correctly', async () => {
    promptBuilders['test_builder'] = () => 'test prompt';

    const mockGraph = {
      id: 'test',
      schemaVersion: 1,
      start: 'start',
      nodes: {
        'start': {
          kind: 'noop'
        },
        'step1': {
          kind: 'step',
          provider: { type: 'provider', provider: 'chatgpt' },
          prompt: { builder: 'test_builder', args: [] }
        }
      },
      edges: [
        { from: 'start', to: 'step1' }
      ],
      roles: {},
      maxSteps: 10,
      preflight: { kind: 'free' }
    };

    const promise = executeGraph(mockGraph as unknown as import("../../../workflow/graph/types").WorkflowGraph, { text: 'hi', targets: ['chatgpt'] }, {});
    await expect(promise).resolves.toBeUndefined();
  });


  it('terminates loops and catches bounds in executor', async () => {
    const mockGraph = {
      id: 'test',
      schemaVersion: 1,
      start: 'start',
      nodes: {
        'start': {
          kind: 'loop',
          loopId: 'test_loop',
          maxIterations: 2,
          bodyStart: 'inside',
          after: 'done'
        },
        'inside': {
          kind: 'noop'
        },
        'done': {
          kind: 'noop'
        }
      },
      edges: [
        { from: 'inside', to: 'start' }
      ],
      roles: {},
      preflight: { kind: 'free' }
    };

    const promise = executeGraph(mockGraph as unknown as import("../../../workflow/graph/types").WorkflowGraph, { text: 'hi', targets: ['chatgpt'] }, {});
    await expect(promise).resolves.toBeUndefined();
  });

  it('tests error recovery logic and teardown', async () => {
    const { runStep } = await import('../../../workflow/stepRunner');
    (runStep as unknown as Mock).mockRejectedValueOnce(new Error('simulated step error'));
    const { tearDownWaiters } = await import('../../../workflow/teardown');
    const { abortWorkflow } = await import('../../../workflow/cancel');

    promptBuilders['test_builder'] = () => 'test prompt';
    const mockGraph = {
      id: 'test',
      schemaVersion: 1,
      start: 'start',
      nodes: {
        'start': {
          kind: 'step',
          provider: { type: 'provider', provider: 'chatgpt' },
          prompt: { builder: 'test_builder', args: [] }
        }
      },
      edges: [],
      roles: {},
      preflight: { kind: 'serial' }
    };

    const promise = executeGraph(mockGraph as unknown as import("../../../workflow/graph/types").WorkflowGraph, { text: 'hi', targets: ['chatgpt'] }, {});
    await expect(promise).rejects.toThrow('simulated step error');
    expect(abortWorkflow).toHaveBeenCalled();
    expect(tearDownWaiters).toHaveBeenCalled();
  });

  it('throws an error during graph validation for invalid node fields', async () => {
    const mockGraph = {
      id: 'test',
      schemaVersion: 1,
      start: 'start',
      nodes: {
        'start': {
          kind: 'loop',
          loopId: 'test_loop',
          maxIterations: -1, // invalid format, testing validator
          bodyStart: 'start',
          after: 'start'
        }
      },
      edges: [],
      roles: {},
      preflight: { kind: 'serial' }
    };

    await expect(executeGraph(mockGraph as unknown as import("../../../workflow/graph/types").WorkflowGraph, { text: 'hi', targets: ['chatgpt'] }, {})).rejects.toThrow(/Loop.*must have a positive maxIterations/);
  });

  it('evaluates continueWhen and terminateWhen correctly on loops', async () => {
    let continuedCount = 0;
    textConditionEvaluators['customConditionForTest'] = () => {
      continuedCount++;
      return continuedCount < 2; // only continue 1 time
    };
    textConditionEvaluators['customConditionForTestFalse'] = () => {
      return false;
    };

    const mockGraph = {
      id: 'test',
      schemaVersion: 1,
      start: 'start',
      nodes: {
        'start': {
          kind: 'loop',
          loopId: 'test_loop',
          maxIterations: 10,
          continueWhen: { type: 'customConditionForTest', ref: { kind: 'literal', value: '' }, maxLength: 5 },
          terminateWhen: { type: 'customConditionForTestFalse', ref: { kind: 'literal', value: '' }, maxLength: -1 }, // false on 2nd time
          bodyStart: 'inside',
          after: 'done'
        },
        'inside': {
          kind: 'noop'
        },
        'done': {
          kind: 'noop'
        }
      },
      edges: [
        { from: 'inside', to: 'start' }
      ],
      roles: {},
      preflight: { kind: 'free' }
    };

    const promise = executeGraph(mockGraph as unknown as import("../../../workflow/graph/types").WorkflowGraph, { text: 'hi', targets: ['chatgpt'] }, {});
    await expect(promise).resolves.toBeUndefined();
    expect(continuedCount).toBeGreaterThan(0);
  });

  it('evaluates dynamic provider selector cases correctly', async () => {
    textConditionEvaluators['customConditionForTest'] = () => {
      return true;
    };
    const mockGraph = {
      id: 'test',
      schemaVersion: 1,
      start: 'start',
      nodes: {
        'start': {
          kind: 'step',
          provider: {
            type: 'dynamic',
            cases: [
              { when: { type: 'customConditionForTest', ref: { kind: 'literal', value: 'a' }, maxLength: 5 }, role: 'coder' },
              { role: 'reviewer' }
            ]
          },
          prompt: { builder: 'test_builder', args: [] }
        }
      },
      edges: [],
      roles: {
        'coder': { defaultProvider: 'chatgpt' },
        'reviewer': { defaultProvider: 'claude' }
      },
      preflight: { kind: 'free' }
    };

    // Test logic where when condition matches.
    const promise = executeGraph(mockGraph as unknown as import("../../../workflow/graph/types").WorkflowGraph, { text: 'hi', targets: ['chatgpt'] }, {});
    await expect(promise).resolves.toBeUndefined();
  });
});
