# Internal API Reference

These are source-level interfaces for the trusted control pane, not a public API or provider-page SDK. All Tauri imports belong in `src/host/`; provider webviews receive zero Tauri permissions. Examples assume a module directly under `src/` running inside the initialized desktop app.

## Host API

Import `host` from `./host`. Implementations and signatures live in [`src/host/index.ts`](../src/host/index.ts).

| Method | Result and behavior |
| --- | --- |
| `host.provider.send(provider, text)` | `Promise<void>`; dispatches `SEND_MESSAGE`. Resolution confirms dispatch, not provider acceptance or response completion. Normal app sends go through `runWorkflow`. |
| `host.provider.stop(provider)` | `Promise<void>`; attempts the provider stop control. This alone does not cancel workflow waiters. |
| `host.provider.fill(provider, text)` | `Promise<void>`; inserts text as a draft into the provider composer without sending it. |
| `host.provider.newSession(provider)` | `Promise<void>`; invokes the provider's new-chat action. |
| `host.connections.get()` | `Promise<ProviderState[]>`; returns all five providers, including the standby. |
| `host.bridge.subscribe(handler)` / `host.bridge.onMessage(handler)` | `Promise<() => void>`; subscribes to the control-pane bus and returns a cleanup function. |
| `host.bridge.subscribeTitle(handler)` | `Promise<() => void>`; subscribes to native title events. Used by the pull bridge; title hints cannot complete a workflow step. |
| `host.snapshot.save(id, json)` / `load(id)` | `Promise<void>` / `Promise<string | null>`; interface for persisting opt-in workflow snapshots to the local disk. |

### Host API Usage Examples

```typescript
import { host } from './host';

// Example: Retrieve current connections and check status
const connections = await host.connections.get();
const chatgpt = connections.find(c => c.provider === 'chatgpt');
if (chatgpt?.dom === 'ready' && chatgpt?.login === 'logged_in') {
  // Safe to send a direct message (bypassing workflow engine tracking)
  await host.provider.send('chatgpt', 'Direct message text');
}

// Example: Safely subscribe to native bridge title events with cleanup
const unsubscribe = await host.bridge.subscribeTitle((message) => {
  if (message.action === 'STATUS_REPORT') {
    console.log('Provider heartbeat:', message.provider, message.payload);
  }
});
// When component unmounts:
// unsubscribe();
```

`App` starts [`startBridgePull()`](../src/bridge/pull.ts) once and disposes its subscription on unmount. A bus subscription alone does not start native event ingestion or outbox polling. Authoritative replies arrive through callback-pull transport and share the bus with local workflow events.

## Control-pane message bus

[`src/bridge/bus.ts`](../src/bridge/bus.ts) exports `onBridgeMessage(handler): () => void` and `publishBridgeMessage(message: BridgeMessage): void`. Publishing is local: it does not send a prompt to a provider. Response-language policy echoes are sanitized before listeners receive response messages.

```typescript
import { onBridgeMessage } from './bridge/bus';

const unsubscribe = onBridgeMessage((message) => {
  if (message.action !== 'RESPONSE_CHUNK') return;
  const payload = message.payload;
  if (typeof payload !== 'object' || payload === null || !('text' in payload)) return;
  if (typeof payload.text !== 'string') return;
  // Update the transcript with payload.text; do not log conversation bodies.
});

// Call unsubscribe() when this consumer is disposed.
```

Every `BridgeMessage` includes `v: 1` and a supported `action`. `payload` is `unknown` and must be narrowed before access. The final-response action is `RESPONSE_DONE`. Title hints are advisory; workflow completion requires a pulled final response.

## Workflow engine

[`runWorkflow(params: RunWorkflowParams): Promise<RunWorkflowResult>`](../src/workflow/index.ts) runs the graph for `mode`. Brainstorm uses `presetId: 'brainstorm'`, not a sixth `ChatMode`.

### `RunWorkflowParams` configuration
- **`text`**: The primary prompt or question to send.
- **`mode`**: The execution mode (`free`, `debate`, `consult`, `coding`, `roundtable`).
- **`presetId`**: Pass `'brainstorm'` to execute the brainstorm graph structure.
- **`activeProviders`**: The current active lineup (exactly 4 providers). Pass this directly from `activeProvidersForStandby`.
- **`targets`**: For `free` mode, specific active providers to receive the prompt.
- **`roles`**: Specific provider assignments for non-free serial modes.
- **`checkpoints`**: Boolean enabling human relay pauses between turns.
- **`snapshotPersistence`**: Boolean enabling durable opt-in snapshot logging.
- **`snapshotRedactionTier`**: The desired privacy tier (e.g. `metadata-only`, `full-local`).

### Workflow Usage Example

```typescript
import { host } from './host';
import { runWorkflow } from './workflow';
import { activeProvidersForStandby, normalizeSettings } from './ui/settingsModel';

const settings = normalizeSettings(await host.settings.get());
const activeProviders = activeProvidersForStandby(settings.standbyProvider);

const result = await runWorkflow({
  text: 'Explain quantum computing',
  mode: 'free',
  activeProviders,
  targets: ['chatgpt', 'claude'],
  checkpoints: true,
  snapshotPersistence: true,
  snapshotRedactionTier: 'full-local'
});

if (!result.ok) {
  // Show result.preflight so the user can repair unavailable role assignments.
  console.warn('Preflight failed. Unavailable providers:', result.preflight.unavailable);
}
```

Free mode sends only to selected, active, sendable providers. Serial modes require all assigned roles to pass preflight. `RunWorkflowResult` is `{ ok: true } | { ok: false; preflight: PreflightResult }`: `ok: true` means the call settled without a preflight rejection. It does **not** guarantee successful replies; runtime errors and cancellation are surfaced through workflow/response events and the run trace.

To cancel an active run, use the same local event as the app:

```typescript
import { publishBridgeMessage } from './bridge/bus';

publishBridgeMessage({ v: 1, action: 'CANCEL_WORKFLOW', transport: 'local' });
```

The workflow runtime aborts, cancels pending timeout actions, and tears down waiters with best-effort provider stops. Calling internal `abortWorkflow()` alone only signals abortion; it does not perform full cleanup. A replacement `runWorkflow` waits for the previous run and its stop cleanup before starting.
