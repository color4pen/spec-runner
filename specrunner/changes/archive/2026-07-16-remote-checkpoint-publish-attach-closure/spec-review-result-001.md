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
| 1 | LOW | Robustness | tasks.md (T-03-d) | `resolveResumeStep` の戻り値を現行コードは捨てている（verify-checkpoint.ts:104 の try/catch が結果を変数に束縛しない）。T-03-d はその戻り値（step 名）を使って descriptor 静的集合から step を引き当てるが、tasks に「既存の resolveResumeStep 呼び出しで解決した step 名を」とだけ書いてあり、変数キャプチャが必要な点が暗黙。 | 実装コメントか T-03-d のチェックリストに「`const resumeStepName = resolveResumeStep(...)` で結果を束縛する」旨を一言加えると実装ミスを防げる。スペックの変更は不要。 |
| 2 | LOW | Invariant enforcement | tasks.md (T-03), design.md (D3-d) | `reads()` が `state` と `deps.slug` のみを参照するという監査済み不変は "実装コメントで明示" 止まりで機械検査がない。将来 step が他の deps（cwd・config 等）を参照し始めると verifyCheckpoint 内の最小 StepDeps 構築が silently wrong になる。 | T-03 AC にコンパイル時検査（例: 型レベルで `reads` の deps 型を限定する）か、descriptor の全 step を走らせる軽量 unit-test を加えることを検討する。スペック本体の変更は不要。 |
| 3 | LOW | Spec clarity | design.md (D3) | D3-b（events.jsonl 必須）と D3-c（counter reversal）を既存の検証順のどこに挿すかが「追加検査を挿す」とだけ書かれており明示されていない。D3-c は既存 composeSplitLayoutFromContent の直後（fold 結果を再利用できる）が自然だが、D3-b は composeSplitLayoutFromContent より前に置くと空文字で fold する前に弾けて効率的になる。 | 実装者への裁量として許容範囲。必要なら tasks.md T-03 に「D3-b は treeFiles 判定なので composeSplitLayoutFromContent の前、D3-c は fold 後」と順序ヒントを追記する。スペック変更は不要。 |
| 4 | LOW | Documentation | design.md (D6), tasks.md (T-06) | architecture/adr/ は CODEOWNERS 管理下と明記されているが、tasks.md は「CODEOWNERS 対象の編集である点に留意」とのみ記し、承認フロー（セルフマージ可 or レビュアー追加必要か）を指定していない。 | T-06 のチェックリストに CODEOWNERS の扱い（architecture maintainer のレビューが PR で必要 / 不要）を明示すると運用上の詰まりを防げる。スペック変更は不要。 |

## 評価サマリ

### 整合性

request.md の 4 症状（publisher 不在・materialize 破壊・OID TOCTOU・弱い述語）は design D1–D6、spec Requirements、tasks T-01–T-09 に 1 対 1 で対応しており、断裂はない。受け入れ基準 5 点も spec Scenario と tasks AC に漏れなく対応している。

### 設計判断

- **Single-seam publisher（D5）**: escalation / exhaustion / guard halt の 3 出口がすべて `runInternal` の loop 末尾に収束する構造を利用し、`state.status === "awaiting-resume"` をガードとする単一 seam を置く判断は合理的。既存 `commitFinalState`（throw しない契約）を再利用するため local resumability が破壊されない点も正しい。
- **OID 固定（D1/D2）**: fetch 後の `git rev-parse origin/<branch>^{commit}` で OID を 1 回だけ解決し、`readCheckpointFromRef` のシグネチャを変えずに呼び出し側で ref を OID に切り替える判断は最小変更かつ正しい TOCTOU 対策。
- **Branch 非破壊（D4）**: 「pre-existence 確認を attach 経路（materializer）で行い、WorktreeManager には決定だけを渡す」という責務分離は new-run の spawn シーケンスに影響を与えず、manager.test.ts 無変更という受け入れ基準と整合する。
- **述語閉鎖（D3）**: `treeFiles` 判定で events.jsonl 存在を確認する（空文字化への依存を排除）、`detectCounterReversal` を content ベースで適用する（composeSplitLayoutFromContent を汚染しない）、reads() を最小 deps で評価する（標準 step の監査済み不変に依存）、いずれも blast radius を最小化した判断。

### セキュリティ

- **注入**: branch 名は git コマンドに配列引数（["fetch", "origin", branch]）として渡されており、シェル展開がないため injection リスクなし。D1 の `rev-parse origin/<branch>^{commit}` も同様。
- **データ損失**: D4 が pre-existing branch の削除を防止。D3 の pure predicate 設計がローカル状態の部分生成を防止。CRITICAL / HIGH 該当なし。
- **認証**: 新規認証接点なし。publish は既存 `commitFinalState` ＋ transport-auth-wrapped spawnFn を踏襲する。
- **TOCTOU**: D1/D2 で fetch 後 OID 固定。修正後は race condition なし。

### 後方互換

- `commitFinalState` の `messageLabel` 既定を `finalize` にするため既存テスト無変更。
- `WorktreeManager.create` の新引数を optional にするため new-run 経路への影響なし。
- `verifyCheckpoint` の `checkpointOid` は透過的に追加（既存検査ロジック不変）。

**結論**: 4 件すべて LOW でブロッカーなし。実装を開始できる。
