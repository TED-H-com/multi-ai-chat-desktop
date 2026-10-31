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

import { ConversationSidebar, type ConversationSidebarLabels } from '../ui/ConversationSidebar';

interface ElementProps {
  'aria-label'?: string;
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
  type?: string;
  value?: string;
}

interface Renderer {
  props: Record<string, unknown>;
  tree: ReactElement;
  render(): void;
  update(props: Record<string, unknown>): void;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const defaultLabels: ConversationSidebarLabels = {
  toggle: 'Toggle sidebar',
  newConversation: 'New conversation',
  history: 'History',
  empty: 'No history',
  deleteConversation: 'Delete',
  confirmDeleteConversation: 'Confirm delete',
};

const mockSessions = [
  { id: '1', title: 'Session 1', updatedAt: Date.now() },
  { id: '2', title: 'Session 2', updatedAt: Date.now() - 100000 },
];

function renderSidebar(overrides: Record<string, unknown> = {}): Renderer {
  hookRuntime.reset();
  const renderer: Renderer = {
    props: {
      collapsed: false,
      sessions: mockSessions,
      activeSessionId: '1',
      disabled: false,
      labels: defaultLabels,
      locale: 'en',
      onToggle: vi.fn(),
      onNewConversation: vi.fn(),
      onSelectSession: vi.fn(),
      onDeleteSession: vi.fn(),
      ...overrides,
    },
    tree: undefined as unknown as ReactElement,
    render() {
      hookRuntime.begin(() => renderer.render());
      renderer.tree = ConversationSidebar(renderer.props as Parameters<typeof ConversationSidebar>[0]);
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

function firstElement(renderer: Renderer, predicate: (element: ReactElement) => boolean): ElementProps {
  const match = findAllElements(renderer.tree, predicate)[0];
  if (!match) throw new Error('Expected element was not found');
  return propsOf(match);
}

function buttonWithLabel(renderer: Renderer, label: string): ElementProps {
  return firstElement(renderer, (element) => element.type === 'button' && propsOf(element)['aria-label'] === label);
}

function buttonWithText(renderer: Renderer, text: string): ElementProps {
  return firstElement(renderer, (element) => element.type === 'button' && textOf(element).includes(text));
}

describe('ConversationSidebar', () => {
  it('renders correctly with sessions', () => {
    const renderer = renderSidebar();
    const rendered = textOf(renderer.tree);
    expect(rendered).toContain('Session 1');
    expect(rendered).toContain('Session 2');
    expect(rendered).toContain(defaultLabels.history);
  });

  it('calls onSelectSession when a session is clicked', () => {
    const onSelectSession = vi.fn();
    const renderer = renderSidebar({ onSelectSession });

    buttonWithText(renderer, 'Session 1').onClick?.();
    expect(onSelectSession).toHaveBeenCalledWith(mockSessions[0]);
  });

  it('calls onNewConversation when new conversation button is clicked', () => {
    const onNewConversation = vi.fn();
    const renderer = renderSidebar({ onNewConversation });

    buttonWithLabel(renderer, defaultLabels.newConversation).onClick?.();
    expect(onNewConversation).toHaveBeenCalled();
  });

  it('handles the delete flow correctly', () => {
    const onDeleteSession = vi.fn();
    const renderer = renderSidebar({ onDeleteSession });

    // Find all delete buttons (aria-label="Delete")
    const deleteButtons = findAllElements(renderer.tree, (element) => element.type === 'button' && propsOf(element)['aria-label'] === defaultLabels.deleteConversation);
    expect(deleteButtons).toHaveLength(2);

    // Click the first delete button
    propsOf(deleteButtons[0]).onClick?.();

    // Now the confirm button should be present
    const confirmButton = buttonWithLabel(renderer, defaultLabels.confirmDeleteConversation);
    expect(confirmButton).toBeDefined();

    // Click the confirm button
    confirmButton.onClick?.();

    expect(onDeleteSession).toHaveBeenCalledWith(mockSessions[0]);

    // The confirm button should be gone now (since state reset)
    expect(() => buttonWithLabel(renderer, defaultLabels.confirmDeleteConversation)).toThrow();
  });
});
