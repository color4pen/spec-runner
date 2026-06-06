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
- Approval is blocked when CRITICAL ≥ 1 OR HIGH ≥ 1.
-->

- **verdict**: needs-fix

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | Correctness | design.md D3, tasks.md T-02 | **delta-append のクラッシュリカバリに二重記録の穴がある。** `persist()` は `events.jsonl` への append 後に `state.json`（カウンタ含む）を更新する。append が成功してカウンタ更新前にクラッシュした場合、カウンタが実際の行数より少ない stale 値になる。次回 `persist()` では stale カウンタを元にデルタを計算するため、既記録のイベントを再 append する。fold はこの重複行を正規の record として処理し、attempt 番号が誤ってインクリメントされる（例: code-review の attempt が 2 になる）。`resolveResumeStep` Tier 2a の attempt 数判定と transition `when` 節の toolResult 参照が壊れ、無音でルーティングが誤る。Risks 節に「二重記録」は挙げられているが、クラッシュリカバリ時の具体的な mitigation が抜けている。 | 次の 2 択のどちらかを design.md に明記する。(a) `load()` 時に fold の実行行数を数えてカウンタと比較し、カウンタが小さければ journal 行数でリセットした上で以降の delta を計算する（冪等リカバリ）。 (b) `persist()` は journal に一切触れず cursor/descriptor のみ overwrite し、journal への書き込みは `appendStepRun` / `appendHistory` の呼び出し点だけに限定する（Open Questions の一本化案）。(a) か (b) を採択し、Risks 節の mitigation を対応する内容で更新する。 |
| 2 | HIGH | Completeness | design.md D7, tasks.md T-12 | **managed runtime の enumeration marker スキーマが未定義。** managed active の列挙は `.specrunner/local/<slug>/` の "metadata marker" に依存するが、design.md・spec.md・tasks.md のいずれにもファイル名・フォーマット・フィールド定義がない。T-12 の Acceptance Criteria が "managed marker の write/clear 責務を確定して実装する" とあるだけで、実装者が参照すべき仕様がない。managed runtime の `job ls` が実装できない。 | spec.md または design.md に managed marker の仕様を追加する: ファイル名（例: `.specrunner/local/<slug>/marker.json`）、フィールド（slug / jobId / status / createdAt 等 index 情報のみ）、write タイミング（managed job 開始時）、clear タイミング（finish / cancel / resume 後）を明記する。T-12 の Acceptance Criteria にも参照を追加する。 |
| 3 | MEDIUM | Completeness | design.md D8, tasks.md T-09 T-13 | **liveness sidecar のスキーマが未定義。** `.specrunner/local/<slug>/` の中身（pid / session / worktreePath / per-attempt sessionId / session log）は複数タスクで参照されるが、ファイル名・フォーマットが仕様化されていない。archive / cancel / resume の worktreePath 参照経路（T-09）と exit-guard の pid 突き合わせ（T-13）の実装が仕様なしで進む。 | design.md D8 に sidecar ファイルレイアウトを追記する（例: `liveness.json`={pid,session,worktreePath}、`session-<attempt>.log` 等）。T-09 の Acceptance Criteria に sidecar スキーマへの参照を追記する。 |
| 4 | MEDIUM | Completeness | tasks.md T-13 | **exit-guard の「自 worktree」識別方法が未定義。** T-13 は exit-guard を「全 job scan → 自 worktree の branch state 更新」に変えると述べるが、"自 worktree" の識別方法（jobId を guard 生成時に注入するか、cwd から推定するか）が spec に存在しない。現行 `createExitGuardHandler(repoRoot)` は全 job スキャンしており、変更後に「どの jobId が自分のものか」を知る手段がない。 | T-13 に識別方法を明記する。推奨: guard 生成時に jobId を注入し `createExitGuardHandler(repoRoot, jobId)` とする。Acceptance Criteria に「guard が jobId を受け取り自 job のみを遷移させる」を追加する。 |
| 5 | MEDIUM | Correctness | tasks.md T-11 | **interruption record スキーマが正式に定義されていない。** T-01 は step-attempt record と transition record を定義するが段1 スコープであり、interruption record は段2 の T-11 で追加される。しかし T-11 の Acceptance Criteria に schema 定義がなく、design.md D2 の非形式的な記述（`reason / errorCode / exhaustionPhase`）しかない。`resumePoint` の fold 再生成ロジックも T-11 に書かれていない。 | T-11 に interruption record の TypeScript インターフェース（またはその参照）と fold での `resumePoint` 再生成ロジックを追加する。 |
| 6 | LOW | Terminology | design.md D1 D6, tasks.md T-10 | **usage.json の "append-only" 表記が実装と齟齬。** design.md の表で usage.json を "append-only" と説明しているが、既存 `appendInvocation` は `atomicWriteJson`（read-modify-write）であり、真の file-level append ではない。T-10 も `appendInvocation` をそのまま利用する方針。crash safety は step commit による git の冪等性で担保されるため実害はないが、表記が実装者を誤解させうる。 | design.md の D1 表および D6 の記述で usage.json の書き方を "overwrite（atomic）" または "JSON 配列への atomic append"に修正し、真の `appendFile` ではないことを明記する。 |

## Summary

アーキテクチャの方向性（journal / projection / liveness の 3 分離、branch 同伴 state、2 段移行）は正しく、設計判断も丁寧に文書化されている。

ブロッカーは 2 件。

- **Finding 1** は段1 の中心的クレームである crash-safety の穴であり、delta-append カウンタのクラッシュリカバリを仕様に盛り込む必要がある。
- **Finding 2** は managed runtime の列挙実装に必要なスキーマが丸ごと欠落している。

Finding 3–5 はスキーマ・識別方法の定義漏れで、実装着手前に埋められる。Finding 6 は表記の修正のみ。
