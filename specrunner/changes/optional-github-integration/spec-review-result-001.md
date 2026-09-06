# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだファイル

| ファイル | 確認内容 |
|---|---|
| `specrunner/changes/optional-github-integration/design.md` | D1〜D12 全 Decision の根拠・代替案・Rationale |
| `specrunner/changes/optional-github-integration/spec.md` | 11 Requirement × 全 Scenario（GWT 形式）|
| `specrunner/changes/optional-github-integration/tasks.md` | T-01〜T-16 の実装タスクと AC |
| `specrunner/changes/optional-github-integration/test-cases.md` | TC-001〜TC-137（62 件）の分類・Source 照合・Priority |
| `src/core/preflight.ts` | 現状の GitHub token 無条件解決の確認 |
| `src/state/schema/types.ts` | `RepositoryInfo`（owner/name 必須）、`JobState`（`githubIntegration` フィールド不在）の現状確認 |
| `src/git/remote.ts` | `getOriginInfo` が GitHub 形式のみを受け入れる現状確認 |
| `src/git/transport-auth.ts` | `buildTransportAuthArgs`（token undefined → `[]` 返却）の安全確認 |
| `src/core/command/reopen.ts` | PR gate 無条件適用の現状確認（L134〜L178）|
| `src/core/archive/plain-archive.ts` | 単相 archive 実装の確認（record→transition→cleanup）|
| `src/core/pipeline/registry.ts` | STANDARD/FAST の terminal step が `pr-create` 固定の確認 |
| `src/core/pipeline/types.ts` | `STANDARD_TRANSITIONS`・`FAST_TRANSITIONS` の全行を確認 |
| `src/core/runtime/factory.ts` | `createRuntime` が `GitHubClient` を必須引数とする現状確認 |
| `src/core/attach/orchestrator.ts` | `expectedRepo: { owner, name }` 必須の現状確認 |
| `src/core/attach/verify-checkpoint.ts` | identity 照合（L187）が `owner`/`name` 直接比較の現状確認 |
| `src/core/step/pr-create.ts` | `githubClient` / `owner` / `repo` 必須の null チェック確認 |
| `src/cli/bootstrap.ts` | `resolveGitHubToken` + `createGitHubClient` を無条件呼び出しの現状確認 |
| `src/core/command/run-result.ts` | `awaiting-archive → result: "pr-created"` 固定の現状確認 |

### 確認した観点

#### design.md
- D1〜D12 の設計決定が request.md の要求・Non-goals・受け入れ条件と整合している。
- 宣言（`github.enabled` in config）と権威（`githubIntegration` in job state）の 2 レイヤ分離は、既存の `profile` / `pipelineId` / `noWorktree` の前例と対称。
- D4 が "host 制約だけ外して token 解決を残してはならない" と明記し、transport-auth への token 注入を `token: undefined` 経由で安全に無効化する設計を確認。
- B-19 architectural invariant（`resolveGitHubToken` / `createGitHubClient` の呼び出しを 2 モジュール + allowlist に限定）が grep 検査でテスト固定される設計を確認。
- FAST_TRANSITIONS に `when: conformanceApprovedForVerifiedRevision` が付く `verification passed → pr-create` 行があり、`applyGitHubIntegration` はこの行の `to` だけを `"end"` に書き換えるため、`when` guard はそのまま保持される設計を確認。
- attach の fail-closed 設計（invoker が disabled でも checkpoint が GitHub-enabled なら GitHub identity 照合を要求 → 提供できなければ拒否）を D8 / T-10 / spec シナリオ・TC-082 で確認。

#### spec.md
- 11 Requirement × 全 Scenario が test-cases.md の "Source" 列で 1:1 に引用されていることを照合。
- "legacy state は GitHub 有効として扱われる" シナリオが `getGitHubIntegration` の absent→true ルールと整合。
- spec シナリオ "invoker の config 変更で有効 job の確認を迂回できない" が "照合できない場合 attach は拒否される" と記述されており、invoker が disabled なら GitHub identity を提供できない（非 GitHub origin からは `getOriginInfo` が `REMOTE_NOT_GITHUB`）→ fail-closed が成立することを確認。

#### tasks.md
- T-01〜T-16 のタスク順序（基盤 → 振る舞い → 境界・診断 → 文書・e2e）が依存関係上適切。
- T-06 が `applyScopeConfig` の後・`composeReviewerDescriptor` の前に `applyGitHubIntegration` を適用することで、custom reviewer pipeline への影響を設計上排除していることを確認。
- T-07 が `LocalRuntime.commitFinalState` の terminal seam に attestation 書き込みを相乗りさせる設計（新 step なし）を確認。
- T-09 AC に "ARCHIVE_USAGE の記述が実装（単相完了）と一致する" が明記されている（T-09 AC は required 扱い）。
- T-07 AC に "pipelineManagedPaths の追加が agent deny path / round staging / worktree reconcile の既存テストを壊さない" が明記されている（T-07 AC は required 扱い）。

#### test-cases.md
- TC-001〜TC-137 の Source 列を spec.md Scenario / tasks.md AC に照合。全 Scenario に対応するテストケースが存在することを確認。
- request.md の AC 全 13 項目を test-cases.md の TC と突き合わせ、全項目に対応するテストが存在することを確認。
- TC-055 が "should" / TC-075 が "should" である一方、それぞれの Source である T-07 AC / T-09 AC は priority マークなし（= required 扱い）であることの不整合を検出。
- e2e テスト群（TC-120〜TC-129）が "実 CLI 経路と既存 CommandRunner を通す" 条件を TC-129 で明示。

#### セキュリティ観点
- credential 露出: `normalizeOriginIdentity` が userinfo を除去して state に保存する（TC-021 / spec "credential を state に残さない"）。✓
- token 注入: `buildTransportAuthArgs(undefined, ...)` が `[]` を返し git transport に注入しない（TC-031）。✓
- attach identity downgrade 攻撃: invoker の config を `false` にしても、checkpoint が GitHub-enabled なら GitHub identity 照合が強制される（D8 fail-closed / TC-082）。✓
- attestation 完全性（OWASP A08）: `attestation.md` が `pipelineManagedPaths` に追加され agent の deny path に入ることで、agent による改ざんが阻止される（D7）。TC-055 はこの integrity 保証の regression テストだが "should" 優先度のため、実装で見落とされるリスクがある。

## 検証できなかった項目

- `src/core/command/runner.ts` の fidelity gate および `notifyJobTerminal` の実装（T-05 対象）は本レビューで未読。変更後の null client ハンドリングが設計通りに実装されるかは実装レビューで確認する必要がある。
- `architecture/model.md` / `architecture/conformance.md` / `architecture/components.md` / `domain-model.md` / `dynamic-model.md`（T-14・T-15 対象のアーキテクチャ文書）は本レビューで未読。実装後の一致確認は T-14 の invariant-catalog-parity テストに委ねる。
- `specrunner guide` / `docs/configuration.md` / `README.md`（T-15 対象）は本レビューで未読。T-15 AC の tests/readme-quickstart.test.ts / dead-guidance.test.ts によって自動検証されることを前提とする。

## Findings 詳細

### F-1: TC-055 の priority が tasks.md T-07 AC と不整合（"should" → "must" が適切）

`test-cases.md` の TC-055（"pipelineManagedPaths への追加が agent deny path / round staging / worktree reconcile の既存テストを壊さない"）は "should" 優先度とされているが、Source である `tasks.md` T-07 AC はすべての項目を priority マークなし（= required 扱い）で列挙しており不整合がある。

`attestation.md` は pipeline が生成した検証証跡ファイルであり、`pipelineManagedPaths` への追加は agent が上書きできないことを保証する唯一の仕組みである。TC-055 は attestation の integrity（OWASP A08: Software and Data Integrity Failures）を守る regression guard として機能するため、"should" では実装で省略されるリスクがある。

**修正方針**: TC-055 の priority を "must" に変更する（tasks.md の T-07 AC との整合、および attestation integrity の保護）。

---

### F-2: TC-075 の priority が tasks.md T-09 AC・request.md の明示要求と不整合（"should" → "must" が適切）

`test-cases.md` の TC-075（"ARCHIVE_USAGE のヘルプ文言が単相 archive 実装と一致する"）は "should" 優先度だが、次の 2 か所で "required" 扱いになっている。

1. **tasks.md T-09 AC**: "ARCHIVE_USAGE の記述が実装（単相完了）と一致する" — priority マークなし（= required 扱い）。
2. **request.md 背景分析**: "CLI helpの「merge後に再archive」は実装と不一致なので、本Issueで触れる案内は現行実装を基準に直す。" と明示。

この不整合を放置すると、TC-075 が "should" であることを根拠に実装で先送りされ、request.md が明示的に修正を要求した誤案内が残留するリスクがある。

**修正方針**: TC-075 の priority を "must" に変更する（tasks.md T-09 AC との整合、および request.md の明示要求への対応）。

---

### 観察（action 不要）

- **RunResultContract schemaVersion**: D7 / Open Questions で "schemaVersion: 1 のまま据え置く" 方針を採用。TC-052 / TC-054 でカバーされており、design.md でトレードオフが明示されているため追加対応不要。
- **FAST_TRANSITIONS の when-guarded 行への変換**: `verification passed (when conformanceApprovedForVerifiedRevision) → pr-create` の `to` を `"end"` に書き換えるだけで `when` guard が保持される。TC-042 でカバーされており問題なし。
- **descriptor 変換の参照同一性**: TC-040 が `enabled: true` で `applyGitHubIntegration` が base と参照同一を返すことを "must" で検証する。D6 の "ゼロオーバーヘッド" 契約を守るために重要。
