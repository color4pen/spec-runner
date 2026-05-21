# Review Feedback — codex-auth-fix — iter 1

- **verdict**: approved

## Summary

実装は request.md / design.md / tasks.md の全要件を正確に満たしている。`OPENAI_API_KEY` チェックは `DispatchingAgentRunner` から完全に除去され、`CodexAgentRunner` は引数なしで構築可能。`Codex()` は SDK にオプションを渡さず生成され、CLI 認証チェーンに委譲される。SDK エラーは `new Error(cause.message)` でラップされ `"Codex SDK error:"` プレフィックスが削除されている。`codex-cli.ts` doctor チェックには `codex auth whoami` 検査が追加され、authenticated/not authenticated/missing-binary の三状態を正しく返す。テストは must カテゴリの TC-01〜TC-11 をほぼ網羅し、verification も build/typecheck/test 全 green（1800 tests passed）。

## Findings

### 1. TC-04 のアサーションが prefix 削除を直接検証していない (minor)

- **severity**: minor
- **file**: tests/adapter/codex/agent-runner.test.ts:170-174
- **detail**: TC-04 の要件は「`result.error?.message` から `"Codex SDK error: "` プレフィックスが付かない」こと。現テストは `toContain("network failure")` のみで、旧実装の `"Codex SDK error: network failure"` でもパスしてしまう。プレフィックスを直接除外するアサーション（例: `expect(result.error?.message).toBe("network failure")` あるいは `expect(result.error?.message).not.toMatch(/^Codex SDK error:/)`）を追加するとリグレッション検出に強くなる。
- **impact**: 実装は正しい（agent-runner.ts:147 で `new Error(cause.message)`）。回帰防止の堅牢性のみが弱い。

### 2. TC-13（auth whoami 5秒タイムアウト）が should なのに未実装 (minor)

- **severity**: minor
- **file**: tests/core/doctor/checks/runtime/codex-cli.test.ts
- **detail**: test-cases.md TC-13（AbortSignal.timeout(5000) で auth whoami がハングしても warn を返す）は should 優先度だが未テスト。実装側 (codex-cli.ts:60) は `AbortSignal.timeout(5000)` を渡しているので機能としては正しい。should の実装率は許容範囲だが、タイムアウト経路のテスト追加を検討するとよい。
- **impact**: should 優先度のため verdict は approved 維持。

### 3. TC-07 の「同一インスタンス再利用」が未検証 (minor)

- **severity**: minor
- **file**: tests/adapter/dispatching/agent-runner.test.ts:87-99
- **detail**: TC-07 は「2回目以降は同一インスタンスを再利用」を要件にしているが、現テストは `claudeRunner.run` が呼ばれないことのみ検証。`this.codexRunner` の lazy キャッシュが効いていることはテストされていない。実装 (dispatching/agent-runner.ts:33-35) は正しいが、`_codexFactory` を `DispatchingAgentRunner` 側にも DI できる設計でないため検証が困難。現状では実装目視で十分。
- **impact**: 機能は動く。設計上の testability の課題で、本変更の責任範囲外。

### 4. codex-cli.ts の catch がエラー詳細を捨てている (nit)

- **severity**: nit
- **file**: src/core/doctor/checks/runtime/codex-cli.ts:50, 66
- **detail**: 2 つの `catch {}` ブロックがエラーを完全に握りつぶしており、stderr/exit code といった診断情報が失われている。design.md はこの形を指定しており動作仕様には準拠しているが、`codex auth whoami` の失敗内容（例: `not logged in` vs `network error` vs `permission denied`）を `hint` に含められると診断性が向上する。スコープ外として現状維持で問題なし。
- **impact**: 仕様準拠。診断 UX のみの改善余地。
