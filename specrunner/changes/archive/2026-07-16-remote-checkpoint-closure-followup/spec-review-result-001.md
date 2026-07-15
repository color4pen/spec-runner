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
| 1 | LOW | Clarity | design.md §D1 | `getStepOutcome` 硬化のフォールバック（guard 除去後に escalate terminal が `transitionJob(awaiting-resume)` を二重呼び）について、`resumePoint` 上書きのリスクが Risks に記載されているが、design 本文では「安全側の終端に落ちる fail-safe」と表記されている。読み方次第で「安全」と「上書き」が矛盾して見える。 | Risks の記述で既にトレードオフとして明記済み。実装コメントで「fail-safe は resume を保証しないが、後続 step 実行よりは安全」と添えると読者の混乱が減る。変更は任意。 |
| 2 | LOW | Test scope | tasks.md §T-02 | coordinator/round テストで `assert: state.status === "awaiting-resume"（escalate terminal 経由）` と書かれているが、D1 ガードは coordinator 経由では現状発火しない（escalate terminal が先に受ける）。テストは既存挙動を保存するための回帰テストとして機能する。 | 意図どおり（コメントに "escalate terminal 経由" と明記してある）。実装時に「D1 ガードがこの経路では発火しない」旨をテストコメントで補足すると将来の混乱を防げる。変更不要。 |

## Code Premise Verification

request-review の attestation で全アサーションが実コードと照合済み。spec-review でも主要前提を独立検証した。

| 前提 | 検証結果 |
|---|---|
| `getStepOutcome`（`pipeline.ts:578`）が `awaiting-resume` を素通りし completionVerdict に落ちる | ✅ 確認（`failed` 分岐のみ `"error"` を返し、await-resume は verdict null → completionVerdict へ） |
| publisher seam（`pipeline.ts:504-506`）が while ループ外に存在し、guard-halt 時は到達しない | ✅ 確認 |
| `workspace-materializer.ts` の attach arm が check → create の非 atomic 順序（line 131-140） | ✅ 確認 |
| `manager.ts:121-123` が `!branchWasPreExisting` で `git branch -D` を実行 | ✅ 確認 |
| `verify-checkpoint.ts:195-197` の `catch { /* skip */ }` が fail-open | ✅ 確認 |
| `executor.ts:360-362` が `completionReason === "timeout"` で `makeTimeoutHalt` を呼ぶ | ✅ 確認 |

## 設計整合性

**D1（guard-halt 終端ガード）**: 挿入位置（`firstUnitExecuted = true` 直後、loop step exit bookkeeping 前）は sequential・coordinator の両分岐が収束した唯一点として正確。escalation は `status="failed"` → `getStepOutcome` → `"error"` → escalate terminal の順で動作し、D1 ガードの発火タイミング（loop 本体直後）で `status` がまだ `running`/`failed` なのでガードは発火しない。exhaustion（`tryExhaust` → `handleExhausted`）は自前 break を持つため同様に影響なし。既存終端経路が壊れないことを Risks で明記済みで整合している。

**D2（branch 所有証明）**: `branchWasPreExisting` → `preserveBranchOnFailure` のリネームは boolean 意味・既定値を保持しており、呼び出し側の positional 引数値は不変。resume-recreated arm は `branchName=undefined` で呼ぶため branch 削除コードに到達せず無影響。new-run arm は第 7 引数省略（既定 false）で既存挙動を維持。設計は自己完結している。

**D3（主役 E2E）**: fake `AgentRunner` が `completionReason: "timeout"` を返すと `executor.ts:360-362` → `makeTimeoutHalt` → `commitHalt` → `attachStateAndRethrow`（status=awaiting-resume 付き）→ `pipeline.ts:279` catch と経路が繋がる。real git（bare origin + 2 clone）構成と fake runner 呼び出し回数による決定論的 assert は、時間依存を排除した堅固な設計。

**D4（fail-closed）**: `checkpointNotAttachableError` は `src/errors.ts:385` 既存実装で reason は自由文字列。新 reason `"resume-reads-unevaluable"` の追加に error code 変更は不要。verify は materialize より前に実行されるため（orchestrator.ts の順序保証）、throw 時に副作用は生じない。

## セキュリティ評価

- 変更はすべて内部 state machine ロジック。新たな外部インターフェース・ネットワーク経路・入力処理は存在しない。
- `git branch -D <branchName>` は `spawn("git", ["branch", "-D", branchName], ...)` の配列形式で呼ばれており、shell インジェクションリスクなし（既存パターンと同じ）。
- D4（fail-closed）はセキュリティ観点では強化（証明不能 → 拒否）。
- OWASP Top 10 該当なし。

## 総評

4 件のバグ（guard-halt が pipeline を止めない、branch 所有証明 race、主役 E2E が proxy 経由、reads() fail-open）は実コードで確認できる実欠陥であり、設計・仕様・タスクはすべて整合している。design.md の代替案検討（Alternatives considered）が各判断を明確に根拠付けている。受け入れ基準はすべて testable で、tasks が対応するファイル・行番号・acceptance criteria を具体的に記述している。HIGH 以上の findings なし。
