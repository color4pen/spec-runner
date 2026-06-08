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
| tasks.md | ❌ | T-03 AC: `sessionId!` が `createOrResumePollingSession` に 2 箇所残存 (L633, L656) |
| design.md | ❌ | D2: L618・L641 相当の `!` 除去が未完了 |
| spec.md | ✅ | 全 Requirement・Scenario に対応する実装とテストが存在する |
| request.md | ✅ | 受け入れ基準はすべて満たされている（`sessionId` 経路は guard 追加済み） |

---

## Findings

### F-01 [needs-fix] `sessionId!` が 2 箇所残存 (T-03 AC 違反)

**Location**: `src/adapter/managed-agent/agent-runner.ts`, `createOrResumePollingSession`

```
L633:  await this.sessionClient.sendUserMessage(sessionId!, initialMessage);
L656:  await this.sessionClient.sendUserMessage(sessionId!, initialMessage);
```

**Violated**: T-03 AC — "agent-runner.ts の `createOrResumePollingSession` に `sessionId!` が 1 箇所も残っていない"

L633 はレジューム失敗後のフォールバック `createSession` 成功直後、L656 は通常の新規 `createSession` 成功直後。
いずれも `try` ブロック内での代入のため、TypeScript の narrowing が `string | undefined` を `string` に絞り込めず、`!` が残っている。

**Fix**: 各 `createSession` 呼び出し後、`sessionResult.sessionId` を `const` に取り出して `sendUserMessage` に渡す。

```typescript
// 例: 通常経路
const sessionResult = await this.sessionClient.createSession({...});
const createdSessionId = sessionResult.sessionId;
sessionId = createdSessionId;
logVerbose(...);
// ...
await this.sessionClient.sendUserMessage(createdSessionId, initialMessage);
```

`createdSessionId` は `string` として宣言時点で narrowed されるため `!` 不要。

---

## Passing Items

- **T-01 / D1**: `environmentNotSetError` factory + `ERROR_CODES.ENVIRONMENT_NOT_SET` 追加済み。`resolveEnvironmentId` helper により `createDesignSession`・`createOrResumePollingSession` 双方の `config.environment!.id` 全 3 箇所が置き換わっている。
- **T-03 (return guard)**: `return sessionId!` は `if (sessionId === undefined) throwWrappedError(...)` に置き換わっている。
- **T-04 / D3**: `state.branch === null` ガードが `fetchResultFile` に追加され、`branchNotSetError` を再利用している。
- **T-05**: `bun run typecheck`・`bun run test`（294 files / 3465 tests）・`bun run lint` すべて green。
- **テスト**: T-02（polling / design 双方）、T-03（sessionId undefined）、T-04（branch null）すべて追加済み。
