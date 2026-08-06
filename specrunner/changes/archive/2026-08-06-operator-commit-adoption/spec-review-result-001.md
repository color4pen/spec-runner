# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### ソースファイル参照の正確性（request.md / design.md の前提）

以下を実際のコードと突き合わせて確認した。

| 参照箇所 | 確認結果 |
|---|---|
| `commit-push.ts:342-374` — `verifyEgressLedger` | ✓ 実コードと一致 |
| `commit-push.ts:383-389` — hand-push convention コメント | ✓ 実コードと一致 |
| `errors.ts:474-480` — `egressUnknownCommitError`、解決手段なし | ✓ 実コードと一致 |
| `resume.ts:290-306` — apply-canon gate | ✓ 実コードと一致 |
| `resume.ts:307-315` — apply-canon commit → `appendSynthesizedCommit` → persist | ✓ 実コードと一致 |
| `resume.ts:316-334` — split-brain guard (`git reset --mixed HEAD~1`) | ✓ 実コードと一致 |
| `apply-canon.ts:42-89` — `detectCanonDirtyPaths`（`git status --porcelain` ベース） | ✓ 実コードと一致 |
| `apply-canon.ts:11-12` — "commits ONLY the specified paths" | ✓ 実コードと一致 |
| `schema/operations.ts:35-39` — `appendSynthesizedCommit` 冪等 | ✓ 実コードと一致 |

### CLI 層の現状確認

- `src/cli/resume.ts` の `ResumeOptions` に `adoptCommits` が未存在（→ T-03 で追加が必要）✓ 確認
- `src/cli/command-registry.ts` の `resume` flags に `"adopt-commits"` が未存在（→ T-03 で追加が必要）✓ 確認
- `src/core/command/resume.ts` の `ResumeOptions` に `adoptCommits` が未存在（→ T-04 で追加が必要）✓ 確認

### util/git-exec.ts エクスポート確認

`SpawnFn`・`runSubprocess`・`gitExec` が正しくエクスポートされており、`adopt-commits.ts` の import 先として architecture-compliant であることを確認した。

### 設計判断（D1〜D7）の妥当性検証

| 判断 | 検証観点 | 結果 |
|---|---|---|
| D1: 新モジュール `adopt-commits.ts` | `apply-canon.ts` との対称性 | ✓ 対称的で `resume.ts` の可読性を保つ構造 |
| D2: 検出無条件・採択は明示 flag | request.md architect 判断と一致 | ✓ 一致 |
| D3: apply-canon 後、pipeline 前の配置 | `resume.ts:290-358` の構造と整合 | ✓ 適切な挿入点 |
| D4: `--apply-canon` の意味を変更しない | `apply-canon.ts:11-12` の保証との整合 | ✓ 既存保証を維持 |
| D5: persist 失敗で fail-closed、git rollback 不要 | 採択が ledger 追加のみで git 変更なし | ✓ 正確 |
| D6: `egressResolutionOptions` を `errors.ts` に共有 | 既存 import 依存グラフと整合 | ✓ leaf 依存で循環なし |
| D7: CLI wiring は `apply-canon` と同形 | 既存 apply-canon 実装との対称性 | ✓ 対称的 |

### spec.md シナリオと受け入れ基準の対応確認

全 5 シナリオが request.md の受け入れ基準 6 項目を網羅していることを確認した（受け入れ基準 ↔ spec.md シナリオ ↔ T-06 テストケースの 3 段対応を追跡）。

### テストハーネスパターンの確認

`src/core/command/__tests__/resume-apply-canon.test.ts` を読み、T-06 で採用するモックハーネスパターン（`vi.hoisted`・`vi.mock` + type cast で `prepare()` を直接呼ぶ）が既存テストで確立されていることを確認した。

### セキュリティ観点

- OWASP Top 10 で該当するリスクなし（ネットワーク入力・認証なし）
- `--adopt-commits` は agent も呼べるが、採択対象の commit が git 履歴に存在することが前提。agent が pipeline 外で commit を作れないなら adopt 対象も存在しない（循環により agent 単独悪用は不可）
- 現状の手動 push 回避策より ledger 記録が増える（provenance 改善）
- commit の subject / author を escalation message に展開する際、terminal への出力に限定されており LLM prompt への injection 経路なし

### `PrepareError` の型確認

`PrepareError(exitCode: 1 | 2)` として定義されており、ユーザー修正可能な停止に `PrepareError(1)` を使う設計は正確であることを確認した。

---

## 検証できなかった項目

- **実行時動作**：静的レビューのため、実際に `bun run test` / `bun run typecheck` を走らせて green を確認していない（T-09 の合否は実装後の CI による）
- **`--no-worktree` 経路での改善メッセージ**：in-pipeline egress halt に `egressResolutionOptions` が含まれることは T-01/T-08 でテストされるが、`--no-worktree` resume 特有の経路をレビューでは追跡していない（設計では acknowledged limitation として D3 Risks に記載済み）

---

## Findings 詳細

### Finding 1（Medium）: `--apply-canon --adopt-commits` 同時指定のテストが存在しない

D4 が「2 つのフラグは直交かつ composable」と明示し、"first commits dirty canon (recording its OID), then adopts any remaining unknown publish-range OIDs" と動作を記述している。この composability には順序依存の不変条件がある：adopt gate が `updatedState.synthesizedCommits`（apply-canon append 後の状態）を読むことで、apply-canon が作った OID が adopt 対象として誤検出されないことが保証される。

T-06 の TC-I1〜TC-I7 はこの combined 経路を網羅していない。TC-I5 は「apply-canon のみ、dirty canon なし、unknown OID あり」をテストするが、apply-canon が実際にコミットを作った後で adopt gate が re-flag しないことはテストしていない。この順序保証が破れた場合（例：ledger の読み取りタイミングを変更するリファクタリング）、テストは検出できない。

**対処**: T-06 に TC-I-combined テストを追加する（`detectCanonDirtyPaths` が `[CANON_PATH]` を返して apply-canon が commit を作り、その OID が adopt 対象に含まれないことを assert）。

### Finding 2（Low）: null `runStore` → `PrepareError(1)` のテストが抜けている

T-04 の実装指示に「`if (runStore) await runStore.persist(updatedState)` をラップして persist throw または null `runStore` が `PrepareError(1)` になるようにする」と明記されている。TC-I4 は persist throws のケースをカバーするが、null `runStore` のケースをテストする AC が T-06 に存在しない。

実際の `runStore` null は test 環境で稀だが、T-04 自体が明示的に null を fail-closed とする実装を要求しているため、対応するテストがあることが望ましい。

**対処**: TC-I4 に `runStore` が null の場合の sub-case を追加するか、別途 TC-I4b として記述する。
