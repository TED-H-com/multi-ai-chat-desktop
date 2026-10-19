# v1.9.7: ChatGPT send confirmation, Claude reply capture, and security fixes

## Changes / 變更

ChatGPT can display a reply even when its matching user-message bubble is unavailable. In v1.9.6, a send-confirmation callback could then replace an already captured answer with `composer cleared before a matching user turn appeared`. The engine now accepts the same guarded reply evidence for send confirmation and response capture. It still requires observed generation for a reply without a user-turn anchor, rejects historical replies and prompt echoes, and waits for final controls and stable content before completion. This addresses a reproduced failure consistent with [#132](https://github.com/TED-H-com/multi-ai-chat-desktop/issues/132); the reporter's signed-in Windows environment remains unverified.

ChatGPT 即使暫時找不到對應的使用者訊息節點，仍可能顯示回答。v1.9.6 的送出確認有機會在已擷取回答後，改回報「composer cleared before a matching user turn appeared」。新版讓送出確認與回覆擷取使用相同的有效回答判定。缺少使用者節點時仍必須觀察到本輪生成活動；舊回答、提示詞回音與使用者訊息仍不能確認送出，完成判定也仍等待最後控制項及內容穩定。此修補已重現與 #132 一致的錯誤，但尚未在回報者已登入的 Windows 環境驗證。

[PR #131](https://github.com/TED-H-com/multi-ai-chat-desktop/pull/131) updates rustls to 0.23.45 with rustls-webpki 0.103.15, source-map-js to 1.2.2, fast-uri to 3.1.8, and brace-expansion to 5.0.12. Scoped overrides select postcss-selector-parser 7.1.6 for Tailwind 3 and postcss-nested 6. JavaScript production audit reports no vulnerabilities; the full JavaScript audit still reports the development-only braces advisory, whose patched version is not published as of 2026-10-19. [PR #129](https://github.com/TED-H-com/multi-ai-chat-desktop/pull/129) updates pinned CI/release Actions, including the paths-filter security fix.

PR #131 更新 Rust TLS 與四項 JavaScript 依賴；JavaScript production audit 為零警報，完整 audit 仍有尚未發布修補版的 braces 開發依賴警報。PR #129 更新固定 SHA 的 CI／release Actions。

Claude adapter v5 adds `[data-cds="AssistantMessage"] [data-perf-reply-text]` for the CDS reply-body layout while retaining all legacy response selectors. It excludes surrounding status text, message actions, and user prose in the tested structures. This addresses the selector gap associated with [#130](https://github.com/TED-H-com/multi-ai-chat-desktop/issues/130); the October layout fixture is synthetic, and an authenticated reporter retest remains pending.

Claude adapter v5 新增 CDS 回答內文 selector，保留舊版 selector；測試確認不會擷取周圍狀態、操作按鈕或使用者訊息。十月版面依據為合成 fixture，#130 仍待回報者登入實測。

The ChatGPT fix changes the bundled engine. An installed v1.9.6 app cannot receive it through an adapter refresh; it requires an updated desktop build. Bundled adapters are ChatGPT v9, Claude v5, Gemini v2, Grok v8, and experimental Meta v3. The original four providers remain the default, with exactly four active at a time; Meta AI remains experimental.

ChatGPT 修補需要更新桌面 app，單純重新整理 adapter 不會更新注入引擎。本版包含 Claude adapter v5；預設仍為原本四家 provider，同時恰好啟用四家，Meta AI 維持實驗性備選。

## Verification / 驗證

- `pnpm verify` passes: 781 Vitest tests, 22 agent tests, TypeScript, ESLint, injected builds, and adapter schema/seed checks. `pnpm build` passes.
- Three regressions fail on the old engine and pass on the fix, covering the first click, retry click, and Enter fallback. Five negative cases retain the existing rejection rules.
- Chromium with the actual compiled engine reproduces the old error after a valid response chunk; the patched engine emits the final answer and exactly one successful DONE, with one send click. This is a simulated provider page, not authenticated provider testing.
- Three Claude regressions cover CDS and legacy replies through streaming completion and reject user prose/tool status. Chromium verifies both layouts using the compiled engine; the September public fixture retains four matches and the synthetic October fixture changes from zero to two.
- 本機驗證通過；瀏覽器測試使用真實編譯引擎與模擬頁面，不能視為已登入實站測試。
- Windows and Apple Silicon release smoke tests remain pending. CI tests and artifact checks do not establish end-user launch or signed-in provider compatibility. Keep the release as a draft until the publishing checks in [RELEASE.md](RELEASE.md) are satisfied.
- Windows 與 Apple Silicon 發版煙霧測試尚待完成；依 RELEASE.md 完成發布前檢查之前，保留為 draft。
