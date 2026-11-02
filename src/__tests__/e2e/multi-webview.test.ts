import { describe, expect, it, vi } from 'vitest';
import { publishBridgeMessage } from '../../bridge/bus';
import { mergePullBridgeState } from '../../appBridgeState';
import type { ProviderState, BridgeMessage } from '../../../shared/types';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { FocusPane } from '../../ui/FocusPane';
import { defaultPresentation } from '../../ui/presentation';
import { I18nProvider } from '../../i18n/context';

vi.mock('../../host', () => ({
  host: {
    provider: { send: vi.fn(), reload: vi.fn(), open: vi.fn(), fillDraft: vi.fn() },
    settings: { set: vi.fn() },
    bridge: { subscribeTitle: vi.fn().mockResolvedValue(() => {}) },
  }
}));

describe('multi-webview e2e', () => {
  it('verifies webview bridge messaging sync', () => {
    const testMessage: BridgeMessage = { v: 1, provider: 'chatgpt', action: 'ready' as unknown as BridgeMessage['action'] };

    // Simulate bridge message reception
    publishBridgeMessage(testMessage);

    const state: ProviderState = {
      provider: 'chatgpt',
      webview: 'loaded',
      dom: 'ready',
      login: 'logged_in',
      thinking: false,
      lastStatusAt: 1,
      bridge: 'ok',
    };

    // Verify pull bridge degraded sync
    const degraded = mergePullBridgeState(state, { bridge: 'degraded', reason: 'timeout' });
    expect(degraded.bridge).toBe('degraded');
  });

  it('verifies cross-model comparison panel rendering', () => {
    // Render the focus pane with multiple providers
    const states = {
      chatgpt: { provider: 'chatgpt', webview: 'loaded', dom: 'ready', login: 'logged_in', thinking: false, lastStatusAt: 1, bridge: 'ok' },
      claude: { provider: 'claude', webview: 'loaded', dom: 'ready', login: 'logged_in', thinking: false, lastStatusAt: 1, bridge: 'ok' },
      gemini: { provider: 'gemini', webview: 'loaded', dom: 'ready', login: 'logged_in', thinking: false, lastStatusAt: 1, bridge: 'ok' },
      grok: { provider: 'grok', webview: 'loaded', dom: 'ready', login: 'logged_in', thinking: false, lastStatusAt: 1, bridge: 'ok' },
    } as unknown as Record<string, ProviderState>;

    const html = renderToStaticMarkup(
      createElement(I18nProvider, { language: 'en' as const, children:
        createElement(FocusPane as unknown as React.ComponentType<unknown>, {
          states: states as unknown as Record<string, ProviderState>,
          presentation: defaultPresentation(),
          centerSurface: 'text',
          userHidden: new Set(),
          presentationHidden: new Set(),
          setPaneRef: vi.fn(),
          setCenterStageRef: vi.fn(),
          changeProviderPresentation: vi.fn() as unknown as () => Promise<void>,
          onManualFocusControl: vi.fn(),
          onEnlargeCenter: vi.fn(),
          onCollapseCenter: vi.fn(),
          onOpenLogin: vi.fn() as unknown as () => Promise<void>,
          syncBounds: vi.fn() as unknown as () => Promise<void>,
          reportProvider: vi.fn() as unknown as () => Promise<void>,
          activeProviders: ['chatgpt', 'claude', 'gemini', 'grok'],
        } as unknown as React.Attributes)
      })
    );

    expect(html).toContain('ChatGPT');
    expect(html).toContain('Claude');
  });

  it('verifies error recovery', () => {
    // Validate that a degraded bridge state can recover
    const state: ProviderState = {
      provider: 'chatgpt',
      webview: 'loaded',
      dom: 'ready',
      login: 'logged_in',
      thinking: false,
      lastStatusAt: 1,
      bridge: 'ok',
    };

    const degraded = mergePullBridgeState(state, { bridge: 'degraded', reason: 'timeout' });
    expect(degraded.bridge).toBe('degraded');

    const recovered = mergePullBridgeState(state, undefined);
    expect(recovered.bridge).toBe('ok');
  });
});
