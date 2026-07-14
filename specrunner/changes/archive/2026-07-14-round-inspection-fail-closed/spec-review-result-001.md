# Spec Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:    specification is complete, consistent, and ready for implementation
  - needs-fix:   specification has issues that must be resolved before implementation
  - escalation:  unresolvable conflicts, missing context, or requires human judgment
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
  - CRITICAL: production outage, data loss, security breach
  - HIGH:     functional failure, clear bug, no workaround — blocks approval
  - MEDIUM:   quality degradation, maintainability issue, future risk
  - LOW:      informational, style, minor improvement
- If no findings, write a table row with "None" or omit the table body.
**Verdict blocking rules (derived by CLI from the reported findings)**:
- `decision-needed` ≥ 1 → `escalation`（request-review では `needs-discussion`）
- `critical` または `high` ≥ 1 → `needs-fix`
- それ以外 → `approved`

markdown の verdict 行と報告された findings が矛盾した場合、**findings 由来の導出が優先**されます。verdict 行は人間向けの要約であり、機械ルーティングには使用されません。
-->

- **verdict**: approved

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | Maintainability | tasks.md T-02 | T-02 は `local.ts:845` の実装変更を網羅しているが、同ファイル L840 のインライン doc comment「Never throws — returns [] on any error」の更新が明示されていない。T-01 は `runtime-strategy.ts` のコメント更新を指示し T-03 は `managed.ts` のコメント更新を指示しているが、`local.ts` 自身のコメントは tasks に記載がなく実装者が見落とす可能性がある。 | T-02 のチェックリストに「`local.ts` L840 付近の doc comment を新 contract（exit 0 = success / 非ゼロ・例外 = unavailable）に更新する」を追記する。あるいは実装者注記として「grep で発見される当該コメントも更新すること」と補記する。 |
| 2 | LOW | Clarity | design.md D3 / Open Questions | managed = `success:[]` の妥当性を spec-review で検証するよう明記された open question。本レビューにおける評価: local の `git status` 失敗（未知状態）と managed の worktree 不在（既知の構造的事実）は本質的に異なり、managed parallel が Non-Goal である現状では `success:[]` が正しい真値。設計判断として妥当と判断し、open question はここで解決とする。 | 設計判断確定。追加アクション不要。 |

## Review Rationale

### Security (fail-closed の妥当性)

現行の `listWorktreeChanges → string[]` は「検査成功の空集合」「検査失敗」「worktree 不在」の 3 状態を `[]` に潰しており、`git status` 失敗時に宣言外変更検査が黙って skip される fail-open であることをコード実測で確認した（`local.ts:852` `return []`、`local.ts:867-869` catch `return []`）。

DU `WorktreeInspectionResult` への変更は型レベルで分岐を強制し、consumer が `kind` の網羅分岐をしないとコンパイルエラーになる構造的保証を与える。`unavailable` 時に `commitRoundArtifacts` を呼ばずに escalation するのは OWASP A01（アクセス制御の侵害）相当の検査迂回を防ぐ正しい設計で、security 観点から approved。

`reason: string` に限定したことで port→domain 依存を増やさず、エラー診断情報は consumer 側で `ErrorInfo` へ写像する設計も既存パターン（`commitRoundArtifacts` の `unknown` 型引数）と整合する。

### Functional correctness

- **D1（DU 型）**: `WorktreeInspectionResult` を `runtime-strategy.ts` に置く判断は ports→domain 非依存を維持し正しい。
- **D2（local）**: exit 0 のみ `success`、それ以外すべて `unavailable` は全失敗経路を網羅しており fetch-open な穴がない（`spawn 例外だけ従来の [] 相当に戻す」という half-fix は design.md D2 代替案として明示的に却下済み）。
- **D3（managed）**: local worktree を構造上持たない managed が `success:[]` を返すのは真値であり、`unavailable` にすることで Non-Goal の managed custom reviewer round を毎回 escalation させる過剰対応を避ける。
- **D4（consumer）**: `unavailable` 時に `commitRoundArtifacts` を呼ばない点を spec L69「MUST NOT」で固定し、test で observable に固定する構成（T-05 新 Scenario）は実装不備を検出できる。
- **method 省略 fake の skip 経路維持**: `deps.runtimeStrategy?.listWorktreeChanges` で optional chain を使っており、method 不在のまま既存 fake が通る経路は変わらない。

### Test coverage adequacy

T-05 が追加する新 Scenario の要件（`outcome = escalation`、`roundError.code = ROUND_INSPECTION_UNAVAILABLE`、`commitRoundArtifacts` 未呼び出し）は既存 Scenario 2（`ROUND_NONDECLARED_CHANGE` 検証）と同等の詳細度で observable に固定されており十分。`local-round-git.test.ts` の既存テストが DU 形に移行することで「非ゼロで `[]` を返していない」ことを型でも assert でも保証する。

### Scope check

design.md / spec.md / tasks.md はいずれも `architecture/` 配下と `specrunner/adr/` 配下を明示的にスコープ外とし、trust-root を out-of-loop に保つ設計を維持している。`partitionRoundChanges` / `commitRoundArtifacts` のロジック変更も除外されており、変更範囲が最小に絞られている。T-06 の変更ファイル制限（4 source + 3 test）は実装者が scope creep を検知できる自己検査として機能する。
