# Spec Review Result: provider-lifecycle-parity-contract

- **Reviewer**: spec-review
- **Date**: 2026-09-04
- **Scope**: architecture, correctness（通常レビュー）/ completeness（task decomposition のみ）

---

## 検証した項目

### Architecture

- **D1: ディレクトリ分離** — `tests/unit/contract/provider-lifecycle/` への新規配置のみ、`src/` に 0 byte の追加なし。Ports & Adapters の方針と整合している。
- **D2: provider-neutral scenario** — turn script による意味層の分離が正しく設計されている。harness がその翻訳のみを担い、scenario 型が provider SDK 型に依存しない構造になっている。
- **D3: 全 case を全 provider で実行（absent 期待値で明示）** — skip を許さず absent 自体を期待値として固定する方針は、要件 5（provider 追加時に暗黙 skip されない）の機械保証として適切。
- **D4: field matrix の field 名を TypeScript parser で導出** — "網羅すべき対象の集合のみを実装から導出し、期待される振る舞いは手書き" という切り分けは設計上正しい。`value-import-scc.test.ts` の既存前例とも整合。
- **D5: case ID 正典を `case-ids.ts` に手書き literal として固定** — `case-ids.ts` が他モジュールを import しないため、依存の向きが一方向に保たれている。ratchet が両者を import して突合する構造は要件の "ケースを削除しても green にしない" を実現している。
- **D9: 静的 ratchet + 実行台帳の 2 本立て** — 静的検査で「table に書いた case の構造的正しさ」を検証し、台帳で「driver が全 case を実際に実行した」を確認する役割分担が明確。台帳が driver と同一ファイルに置かれ、vitest の宣言順直列実行に依存することは設計で明記されており、`ファイル分離は不可` という rationale も文書化済み。
- **D11: UNEXPLAINED ratchet** — 未説明差分が混入した状態でマージできなくなる仕組みとして適切。D11 の手順（停止・報告）が T-09 の acceptance criteria に対応づけられている。
- **D12: production 不変の機械保証** — T-10 で `git diff --stat -- src/` を確認する手順と、既存テストファイル変更なしの確認を要求している。

### Correctness

- **D7: universal invariant `addedTurns.reportRetry + addedTurns.outputRepair === followUpAttempts`** — port doc comment（`agent-runner.ts` line 340〜343）の "Invariant:" 記述と一致している。Codex では `addedTurns` が absent のため `addedTurns が存在するとき` という条件付きになっており、Codex ケースへの誤適用はない。
- **D6: 31 件の case 数学的整合性** — shared 20 件（2+3+2+3+4+3+1+2）+ provider-specific 11 件（2+3+5+1）= 31 件。合計値が一致する。
- **T-06: field matrix 15 件** — `AgentRunResult` の field を `agent-runner.ts` 実体から数えると `completionReason`, `resultContent`, `toolResult`, `followUpAttempts`, `transientRetryAttempts`, `sessionId`, `agentBranch`, `error`, `modelUsage`, `completionReportDiagnostics`, `addedTurns`, `contextMetrics`, `invocationMetrics`, `touchedFiles`, `sessionRollovers` の 15 件と一致する。
- **T-06 capability 分類** — `addedTurns` / `contextMetrics` / `invocationMetrics` / `touchedFiles` / `sessionRollovers` が claude-code `supported` / codex `absent` であること、`completionReportDiagnostics` が claude-code `absent` / codex `supported` であることを `agent-runner.ts` の doc comment と照合し、いずれも正確に対応している。
- **D10: fake timer パターン** — `usesFakeTimers: true` フラグを case 側に持たせ、driver の case body 内でのみ `vi.useFakeTimers()` / `vi.useRealTimers()` を切り替える設計は、fs I/O を含む他の case が fake timer に影響されない点で正しい。
- **T-04: `complete-without-report` と `complete-with-unparseable-report` の Codex 内部挙動** — Codex ではどちらも "JSON 抽出失敗" の同一経路に落ちることが T-04 で明記されており、コメント要求も設けられている。
- **T-08: provider registry ratchet の 3 集合照合** — `src/adapter/` 配下の local adapter ディレクトリ集合、`CONTRACT_PROVIDERS`、`PROVIDER_HARNESSES` のキー集合が三者一致することを要求しており、`managed-agent` 等の除外理由も design 内で説明済み。
- **Open Question（`metrics.session-rollovers-absent-without-rollover` を shared 分類）** — 設計が能力差を認識した上で "同じ scenario で同じ結果" を shared の定義とし、case 説明への明記を要求している。設計上の選択として妥当。

### Completeness（task decomposition のみ）

- 要件 1（contract matrix）→ T-01（case ID）+ T-05（case table）で全カバー。
- 要件 2（provider-neutral scenario）→ T-02（scenario 型）+ T-03（Claude harness）+ T-04（Codex harness）+ T-07（driver）で全カバー。
- 要件 3（provider 差の分類・固定）→ T-05（case table の classification + reason）+ T-06（field matrix）で全カバー。
- 要件 4（retry / turn accounting の固定）→ T-05（case シナリオ設計）+ T-07（universal invariant assertion）で全カバー。
- 要件 5（coverage ratchet）→ T-08 の 7 つの ratchet（ID / area / shared coverage / reason / UNEXPLAINED / provider registry / skip / field matrix / SDK containment）で全カバー。
- 要件 6（既存テスト維持）→ T-10（`git diff --name-status` 確認）で全カバー。
- 受け入れ条件の全 12 項目について対応する task が存在する。
- test-cases.md の 55 件は spec.md の全シナリオと tasks.md の全 acceptance criteria をカバーしている。

---

## 検証できなかった項目

- **production adapter の実動作との整合性**（`ClaudeCodeRunner` / `CodexAgentRunner` の実装詳細）: 現在の変更が production を動かさない characterization 専用の change であるため、harness が現行実装の挙動を正確に characterize しているかは実装時の読解・実測に委ねられる。設計はこれを明示的に「期待値は現行実装の読解から先に決め、red が出たら実装ではなく期待値と実測を突合する」という方針（tasks.md 共通ルール）で扱っている。
- **vitest のファイル内直列実行の runtime 保証**: 設計は vitest がファイル内の `it` を宣言順に直列実行する前提を明記・コメント要求しているが、vitest の future version でこの保証が変わるリスクは runtime 依存のため静的には検証できない。設計上は許容されたトレードオフとして文書化されている。
- **`contextMetrics` の "supported, observed at least once" チェックの実現可能性**: `contextMetrics` は Claude SDK が context events を emit した場合のみ populate される。harness の scenario がこれを emit できるかは T-02 の metrics ヒント設計（"context window サイズ" オプション）に依存し、`metrics.context-metrics-presence` case がそのヒントを含む scenario を組む実装になっているかは実装フェーズの確認事項。

---

## Findings 詳細

### F-001: T-07 — `"absent"` sentinel の assertion 変換ロジックが未規定

**severity**: medium  
**file**: specrunner/changes/provider-lifecycle-parity-contract/tasks.md  
**location**: T-07  

**内容**: T-05 の期待値型では `transientRetryAttempts` と `addedTurns` が `数値 or "absent"` という union を持つ。`"absent"` は「そのフィールドが `undefined` であること」を表すセンチネルだが、T-07 には "宣言された期待値のみを assert する" とあるだけで、`"absent"` センチネルを `expect(result.X).toBeUndefined()` に変換するロジックの仕様が記載されていない。

**問題**: 実装者が `"absent"` を誤って `expect(result.transientRetryAttempts).toBe("absent")` と実装すると、常に失敗するアサーションになる。あるいは `"absent"` を見てチェックをスキップすると、`transient.disabled-omits-attempts-field` ケースのフィールド不在保証が失われる。

**修正案**: T-07 に「期待値が `"absent"` のとき `expect(result[field]).toBeUndefined()` として assert する」旨を 1 文追記する。

---

### F-002: T-07 / T-05 — `fieldPresence` 期待値の assertion ロジックも同様に未規定

**severity**: low  
**file**: specrunner/changes/provider-lifecycle-parity-contract/tasks.md  
**location**: T-07  

**内容**: T-05 で期待値型に `fieldPresence?: { [field: string]: "present" | "absent" }` が定義されているが、T-07 には この map の各エントリをどう assert するかの仕様がない。`"present"` は `expect(result[field]).toBeDefined()`、`"absent"` は `expect(result[field]).toBeUndefined()` が自然な解釈だが、D4 の field matrix による横断 assert（capability matrix で `absent` の field は全 case で `undefined`）との役割分担も明示されていない。

**修正案**: T-07 に `fieldPresence` エントリの解釈（`"present"` → `toBeDefined()`、`"absent"` → `toBeUndefined()`）と、D4 の matrix 横断 assert との関係（matrix は全 case に適用、`fieldPresence` は case 固有の spot-check として追加する）を 1 段落追記する。

---

### F-003: TC-042 — 台帳検査の test 件数が "台帳検査分" と曖昧

**severity**: low  
**file**: specrunner/changes/provider-lifecycle-parity-contract/test-cases.md  
**location**: TC-042  

**内容**: TC-042 の Then 条件に "実行される test 件数が 62 + 台帳検査分であり" とあるが、"台帳検査分" の具体的な件数が明示されていない。D9 の設計では台帳検査は「実行 `(caseId, provider)` ペアの完全一致」と「supported field の観測記録」の 2 項目（T-07 の describe 2 件）だが、実装によって `it` の数が変わり得る。

**修正案**: TC-042 の Then に "62 件（parity 実行）+ 2 件（台帳検査）= 合計 64 件以上" のように下限を明記する（台帳 describe 内の it 数は実装依存だが最低件数を固定する）。
