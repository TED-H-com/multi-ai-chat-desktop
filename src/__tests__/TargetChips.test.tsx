import { ReactElement, ReactNode, isValidElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hookRuntime = vi.hoisted(() => {
  let cursor = 0;
  let rerender = () => {};
  const initialized: boolean[] = [];
  const values: unknown[] = [];

  return {
    reset() {
      cursor = 0;
      rerender = () => {};
      initialized.length = 0;
      values.length = 0;
    },
    begin(nextRerender: () => void) {
      cursor = 0;
      rerender = nextRerender;
    },
    useState(initial: unknown) {
      const index = cursor;
      cursor += 1;
      if (!initialized[index]) {
        values[index] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
        initialized[index] = true;
      }
      const setState = (next: unknown) => {
        values[index] = typeof next === 'function' ? (next as (current: unknown) => unknown)(values[index]) : next;
        rerender();
      };
      return [values[index], setState];
    },
    useRef(initial: unknown) {
      const index = cursor;
      cursor += 1;
      if (!initialized[index]) {
        values[index] = { current: initial };
        initialized[index] = true;
      }
      return values[index];
    },
    useEffect() {
      cursor += 1;
    },
    useCallback(fn: unknown) {
      cursor += 1;
      return fn;
    },
    useMemo(fn: () => unknown) {
      const index = cursor;
      cursor += 1;
      if (!initialized[index]) {
        values[index] = fn();
        initialized[index] = true;
      }
      return values[index];
    },
    useContext() {
      cursor += 1;
      return {};
    },
  };
});


vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useEffect: hookRuntime.useEffect,
    useRef: hookRuntime.useRef,
    useState: hookRuntime.useState,
    useCallback: hookRuntime.useCallback,
    useMemo: hookRuntime.useMemo,
    useContext: hookRuntime.useContext,
  };
});

import { TargetChips } from '../ui/TargetChips';
import type { AIProvider, ProviderState } from '../../shared/types';
import { AI_PROVIDERS } from '../../shared/constants';

interface ElementProps {
  children?: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  type?: string;
  className?: string;
}

interface Renderer {
  props: Parameters<typeof TargetChips>[0];
  tree: ReactElement;
  render(): void;
  update(props: Partial<Renderer["props"]>): void;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const defaultProviders: AIProvider[] = ['chatgpt', 'claude'];
const defaultStates: Record<AIProvider, ProviderState> = {
  meta: { provider: "meta", webview: "none", dom: "unknown", login: "unknown", thinking: false, lastStatusAt: 1 },
  chatgpt: {
    provider: 'chatgpt',
    webview: 'loaded',
    dom: 'ready',
    login: 'logged_in',
    thinking: false,
    lastStatusAt: 1,
  },
  claude: {
    provider: 'claude',
    webview: 'loaded',
    dom: 'ready',
    login: 'logged_in',
    thinking: false,
    lastStatusAt: 1,
  },
  gemini: {
    provider: 'gemini',
    webview: 'none',
    dom: 'unknown',
    login: 'unknown',
    thinking: false,
    lastStatusAt: 1,
  },
  grok: {
    provider: 'grok',
    webview: 'none',
    dom: 'unknown',
    login: 'unknown',
    thinking: false,
    lastStatusAt: 1,
  },
};

function renderTargetChips(overrides: Partial<Renderer["props"]> = {}): Renderer {
  hookRuntime.reset();
  const renderer: Renderer = {
    props: {
      providers: defaultProviders,
      states: defaultStates,
      selected: ['chatgpt'],
      onChange: vi.fn(),
      disabled: false,
      locale: 'en',
      ...overrides,
    },
    tree: undefined as unknown as ReactElement,
    render() {
      hookRuntime.begin(() => renderer.render());
      // TargetChips uses Fragments so we wrap it in a div
      renderer.tree = (<div>{TargetChips(renderer.props)}</div>) as ReactElement;
    },
    update(props) {
      renderer.props = { ...renderer.props, ...props };
      renderer.render();
    },
  };
  renderer.render();
  return renderer;
}

function propsOf(element: ReactElement): ElementProps {
  return element.props as ElementProps;
}

function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf(propsOf(node).children);
  return '';
}

function findAllElements(node: ReactNode, predicate: (element: ReactElement) => boolean): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap((child) => findAllElements(child, predicate));
  if (!isValidElement(node)) return [];

  const matches = predicate(node) ? [node] : [];
  return [...matches, ...findAllElements(propsOf(node).children, predicate)];
}

describe('TargetChips', () => {
  it('renders chips for each provided provider', () => {
    const renderer = renderTargetChips();
    const rendered = textOf(renderer.tree);
    expect(rendered).toContain(AI_PROVIDERS.chatgpt.name);
    expect(rendered).toContain(AI_PROVIDERS.claude.name);
  });

  it('calls onChange to toggle selection when a chip is clicked', () => {
    const onChange = vi.fn();
    const renderer = renderTargetChips({ onChange });

    const buttons = findAllElements(renderer.tree, (element) => element.type === 'button');
    expect(buttons).toHaveLength(2);

    // Click on 'claude' which is not selected yet
    propsOf(buttons[1]).onClick?.();
    expect(onChange).toHaveBeenCalledWith(['chatgpt', 'claude']);
  });

  it('disables chips when disabled prop is true', () => {
    const renderer = renderTargetChips({ disabled: true });

    const buttons = findAllElements(renderer.tree, (element) => element.type === 'button');
    expect(buttons).toHaveLength(2);
    expect(propsOf(buttons[0]).disabled).toBe(true);
    expect(propsOf(buttons[1]).disabled).toBe(true);
  });

  it('disables chips when the provider is not sendable', () => {
    const states = {
      ...defaultStates,
      claude: { ...defaultStates.claude, dom: 'unknown' as const },
    };

    const renderer = renderTargetChips({ states });

    const buttons = findAllElements(renderer.tree, (element) => element.type === 'button');
    expect(buttons).toHaveLength(2);
    expect(propsOf(buttons[0]).disabled).toBe(false);
    expect(propsOf(buttons[1]).disabled).toBe(true);
  });
});
