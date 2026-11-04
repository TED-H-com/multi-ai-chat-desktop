# API Reference

This document provides API specifications and usage examples for the core modules of Multi-AI Chat Desktop: `src/host`, `src/bridge`, and `src/workflow`.

## `src/host` (Host API)

The `host` object provides a proxy to the Tauri backend (Rust). It handles provider windows, settings, snapshots, and other backend tasks. All calls to `@tauri-apps/api/core` (`invoke`) or `@tauri-apps/api/event` (`listen`) must be channeled through this module.

### Core Methods

- **`host.provider.send(provider: AIProvider, text: string): Promise<void>`**
  Sends a message text to the specified AI provider.
  ```typescript
  import { host } from '../host';
  await host.provider.send('chatgpt', 'Hello, ChatGPT!');
  ```

- **`host.provider.stop(provider: AIProvider): Promise<void>`**
  Attempts to stop the current generation of a response by the specified AI provider.
  ```typescript
  await host.provider.stop('claude');
  ```

- **`host.connections.get(): Promise<ProviderState[]>`**
  Retrieves the current state of all provider connections (e.g., loaded, logged in).
  ```typescript
  const connections = await host.connections.get();
  console.log(connections);
  ```

- **`host.bridge.subscribe(handler: (message: BridgeMessage) => void): Promise<() => void>`**
  Subscribes to all incoming messages from the AI provider webviews. Returns an unsubscribe function.

## `src/bridge` (Automation Bridge)

The `bridge` module (e.g., `src/bridge/bus.ts`) is the message bus that handles communication between the control pane (React app) and the injected content scripts running in the provider webviews.

### Core Methods

- **`publishBridgeMessage(message: BridgeMessage): void`**
  Publishes a message to all subscribed listeners.
  ```typescript
  import { publishBridgeMessage } from '../bridge/bus';

  publishBridgeMessage({
    action: 'STATUS_REPORT',
    provider: 'chatgpt',
    payload: { status: 'ready' }
  });
  ```

- **`onBridgeMessage(handler: (message: BridgeMessage) => void): () => void`**
  Registers a listener for bridge messages. Use this to react to incoming messages (like `RESPONSE_CHUNK` or `DONE`). Returns a function to unsubscribe.
  ```typescript
  import { onBridgeMessage } from '../bridge/bus';

  const unsubscribe = onBridgeMessage((msg) => {
    if (msg.action === 'RESPONSE_CHUNK') {
      console.log(`Received chunk from ${msg.provider}:`, msg.payload.text);
    }
  });
  ```

## `src/workflow` (Workflow Engine)

The `workflow` module manages the orchestration of multiple AI providers based on predefined presets (e.g., Free, Debate, Consult, Coding, Roundtable, Brainstorm).

### Core Methods

- **`runWorkflow(params: RunWorkflowParams): Promise<RunWorkflowResult>`**
  Starts and executes a workflow graph based on the provided configuration.
  ```typescript
  import { runWorkflow } from '../workflow';

  const result = await runWorkflow({
    text: "Explain quantum computing",
    mode: "free",
    activeProviders: ["chatgpt", "claude"]
  });

  if (result.ok) {
    console.log("Workflow completed successfully!");
  } else {
    console.error("Workflow failed preflight", result.preflight);
  }
  ```

- **`abortWorkflow(): void`**
  Cancels any currently running workflow.
  ```typescript
  import { abortWorkflow } from '../workflow/cancel';

  abortWorkflow();
  ```
