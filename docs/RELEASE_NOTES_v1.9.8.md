# v1.9.8: Reliable reply handoffs and maintenance fixes

This release includes the compatibility fixes from the unpublished v1.9.7 draft and the maintenance fixes merged since then. Updating the desktop app is required for the engine and bridge repairs; refreshing adapters alone is insufficient.

本版包含尚未正式發布的 v1.9.7 相容性修補，以及其後的維護更新。請更新桌面 app；只重新整理 adapter 無法取得引擎與橋接修正。

## Changes / 變更

- **ChatGPT:** preserve a captured reply when the matching user-message node is unavailable, instead of replacing it with a false send-confirmation error. The guarded detection still rejects historical replies and prompt echoes. Addresses the reproduced failure associated with [#132](https://github.com/TED-H-com/multi-ai-chat-desktop/issues/132).
- **Claude:** adapter v5 captures CDS assistant reply bodies and retains legacy selectors. The newer-layout fixture is synthetic; authenticated compatibility is not established by that fixture. Related issue: [#130](https://github.com/TED-H-com/multi-ai-chat-desktop/issues/130).
- **Reply delivery:** delayed acknowledgements, reloads, old callbacks, and old DONE watchdogs cannot consume or stop the next turn's replies. Malformed outbox entries and subscription failures recover without crashing consumption.
- **Security and maintenance:** redact `apiKey` diagnostic fields, refresh vulnerable JavaScript tooling and Rust TLS dependencies, and remove unused archive extraction from the inactive updater dependency. Update checks point to the current TED-H-com repository.
- **UI and developer documentation:** retain bounded diagnostics selection and frame-callback reuse without changing scroll-handler lifetimes. Correct the internal API examples, four-provider lineup, cancellation cleanup, and workflow-result semantics.

ChatGPT 不再因找不到使用者訊息節點而覆蓋已擷取的有效回答；Claude 增加新版回答內文 selector；修正重載與跨回合 ACK／回呼競態，避免下一輪回答遺失。另包含診斷敏感欄位遮罩、依賴更新、更新檢查網址與開發文件修正。

Bundled adapters: ChatGPT v9, Claude v5, Gemini v2, Grok v8, experimental Meta v3. ChatGPT, Claude, Gemini, and Grok remain the defaults; exactly four providers are active at a time. Meta AI remains an experimental standby/replacement.

預設仍為 ChatGPT、Claude、Gemini、Grok，同時恰好啟用四家。Meta AI 維持實驗性備選。

## Verification and limitations / 驗證與限制

- Local `pnpm verify`: 810 frontend tests, 22 agent tests, TypeScript, ESLint, injected builds, and adapter schema/seed checks pass. Production build and Rust formatting pass. API code examples pass TypeScript checking against the current source.
- Full JavaScript audit reports zero advisories on 2026-11-06. The existing GLib `VariantStrIter` advisory, [GHSA-wrw7-89jp-8q8g](https://github.com/advisories/GHSA-wrw7-89jp-8q8g), remains open on the GTK3 dependency line; this is not an all-dependencies security clearance.
- Source-launch dry-run correctly reports missing local Rust/native GUI prerequisites and performs zero writes. CI results and artifact verification are separate from native desktop smoke tests.
- Windows and Apple Silicon launch/login smoke, including Grok leaving Cloudflare verification on Apple Silicon, remain pending. ChatGPT #132 still needs a signed-in Windows reporter retest. This release does not claim those checks passed. Publishing follows [RELEASE.md](RELEASE.md).

Windows 與 Apple Silicon 的啟動／登入實測仍待完成；本機測試與 CI 不能視為實機登入驗證。ChatGPT #132 仍待已登入的 Windows 環境重測。
