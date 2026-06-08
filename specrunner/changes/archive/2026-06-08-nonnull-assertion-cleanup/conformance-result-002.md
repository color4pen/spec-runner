# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: needs-fix

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ❌ | T-03 AC: `sessionId!` が `createOrResumePollingSession` に 2 箇所残存（L633, L656）— iteration 1 と同一 |
| design.md | ❌ | D2: L618・L641 相当の `!` 除去が未完了（iteration 1 と同一） |
| spec.md | ✅ | 全 Requirement・Scenario に対応する実装とテストが存在する |
| request.md | ✅ | 受け入れ基準はすべて満たされている |

---

## Findings

### F-01 [needs-fix] `sessionId!` が 2 箇所残存（iteration 1 から未修正）

**Location**: `src/adapter/managed-agent/agent-runner.ts`, `createOrResumePollingSession`

```
L633:  await this.sessionClient.sendUserMessage(sessionId!, initialMessage);
L656:  await this.sessionClient.sendUserMessage(sessionId!, initialMessage);
```

**Violated**: T-03 AC — "agent-runner.ts の `createOrResumePollingSession` に `sessionId!` が 1 箇所も残っていない"

iteration 1 の conformance-result-001.md で同一 finding が報告済み。iteration 2 でも修正されていない。

**Fix**: `createdSessionId` を `const` に取り出し、`sendUserMessage` 呼び出しに直接渡す。

```typescript
// フォールバック経路（L620 付近）
const sessionResult = await this.sessionClient.createSession({ ... });
const createdSessionId = sessionResult.sessionId;
sessionId = createdSessionId;
logVerbose(...);
// ...
await this.sessionClient.sendUserMessage(createdSessionId, initialMessage); // ! 不要

// 通常経路（L641 付近）
const sessionResult = await this.sessionClient.createSession({ ... });
const createdSessionId = sessionResult.sessionId;
sessionId = createdSessionId;
logVerbose(...);
// ...
await this.sessionClient.sendUserMessage(createdSessionId, initialMessage); // ! 不要
```

`createdSessionId` は宣言時点で `string` に narrowed されるため `!` 不要。

---

## Passing Items

- **T-01 / D1**: `environmentNotSetError` factory + `ERROR_CODES.ENVIRONMENT_NOT_SET` 追加済み。`resolveEnvironmentId` helper により `createDesignSession`・`createOrResumePollingSession` 双方の `config.environment!.id` 全 3 箇所が置き換わっている。
- **T-03 (return guard)**: `return sessionId!` は `if (sessionId === undefined) throwWrappedError(...)` に置き換わっている。
- **T-04 / D3**: `fetchResultFile` に `state.branch === null` ガードが追加され、`branchNotSetError` を再利用している。`state.branch!` は残存しない。
- **T-05**: `bun run typecheck`・`bun run test`・`bun run lint` すべて green。
- **テスト**: T-02（polling / design 双方）、T-03（sessionId undefined）、T-04（branch null）すべて追加済み。
