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

import { t } from '../i18n/t';
import { InputBar } from '../ui/InputBar';

interface InputBarProps {
  onSend: (text: string) => boolean | void | Promise<boolean | void>;
  onCancel: () => void;
  disabled: boolean;
  sendBlocked?: boolean;
  blockedMessage?: string;
  isProcessing: boolean;
  locale?: "en" | "zh-TW" | "ja" | "de";
}

interface ElementProps {
  'aria-label'?: string;
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  onChange?: (event: unknown) => unknown;
  onClick?: () => void;
  placeholder?: string;
  type?: string;
  value?: string;
}

interface Renderer {
  props: InputBarProps;
  tree: ReactElement;
  render(): void;
  update(props: Partial<InputBarProps>): void;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderInputBar(overrides: Partial<InputBarProps> = {}): Renderer {
  hookRuntime.reset();
  const renderer: Renderer = {
    props: {
      onSend: vi.fn(),
      onCancel: vi.fn(),
      disabled: false,
      isProcessing: false,
      locale: 'en',
      ...overrides,
    },
    tree: undefined as unknown as ReactElement,
    render() {
      hookRuntime.begin(() => renderer.render());
      renderer.tree = InputBar(renderer.props as InputBarProps);
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

function buttonWithText(renderer: Renderer, text: string): ElementProps {
  return firstElement(renderer, (element) => element.type === 'button' && textOf(element).includes(text));
}

function sendButton(renderer: Renderer): ElementProps {
  return buttonWithText(renderer, t('input.send', 'en'));
}

function textarea(renderer: Renderer): ElementProps {
  return firstElement(renderer, (element) => element.type === 'textarea');
}

function changeText(renderer: Renderer, value: string) {
  textarea(renderer).onChange?.({ target: { value } });
}

describe('InputBar', () => {
  it('calls onSend when text is typed and sent', async () => {
    const onSend = vi.fn().mockReturnValue(true);
    const renderer = renderInputBar({ onSend });

    changeText(renderer, 'Hello world');
    sendButton(renderer).onClick?.();

    expect(onSend).toHaveBeenCalledWith('Hello world');
  });

  it('shows standard placeholder when enabled', () => {
    const renderer = renderInputBar();
    expect(textarea(renderer).placeholder).toBe(t('input.messagePlaceholder', 'en'));
  });

  it('shows disabled placeholder when disabled', () => {
    const renderer = renderInputBar({ disabled: true });
    expect(textarea(renderer).placeholder).toBe(t('input.connectProvider', 'en'));
  });

  it('shows blocked message when send is blocked', () => {
    const renderer = renderInputBar({ sendBlocked: true, blockedMessage: 'Custom Block' });
    expect(textarea(renderer).placeholder).toBe('Custom Block');
  });

  it('shows processing placeholder when isProcessing is true', () => {
    const renderer = renderInputBar({ isProcessing: true });
    expect(textarea(renderer).placeholder).toBe(t('input.workflowRunning', 'en'));
  });

  it('shows cancel button and calls onCancel when isProcessing is true', () => {
    const onCancel = vi.fn();
    const renderer = renderInputBar({ isProcessing: true, onCancel });

    const cancelBtn = buttonWithText(renderer, t('input.stop', 'en'));
    expect(cancelBtn).toBeDefined();

    cancelBtn.onClick?.();
    expect(onCancel).toHaveBeenCalled();
  });
});
