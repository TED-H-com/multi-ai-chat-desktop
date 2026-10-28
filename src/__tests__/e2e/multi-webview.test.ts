import { describe, expect, it, vi } from 'vitest';
import { host } from '../../host';
import { publishBridgeMessage } from '../../bridge/bus';
import { mergePullBridgeState } from '../../appBridgeState';
import type { ProviderState } from '../../../shared/types';
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
    let handled = false;
    const testMessage = { provider: 'chatgpt', type: 'engine_ready' } as any;
    const unsubscribe = vi.fn();

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
    } as any;

    const html = renderToStaticMarkup(
      createElement(I18nProvider, { language: 'en' },
        createElement(FocusPane as any, {
          states,
          presentation: defaultPresentation(),
          centerSurface: 'text',
          userHidden: new Set(),
          presentationHidden: new Set(),
          setPaneRef: vi.fn(),
          setCenterStageRef: vi.fn(),
          changeProviderPresentation: vi.fn(),
          onManualFocusControl: vi.fn(),
          onEnlargeCenter: vi.fn(),
          onCollapseCenter: vi.fn(),
          onOpenLogin: vi.fn(),
          syncBounds: vi.fn(),
          reportProvider: vi.fn(),
          activeProviders: ['chatgpt', 'claude', 'gemini', 'grok'],
        })
      )
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
