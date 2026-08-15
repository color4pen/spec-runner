# Spec Review Result: absorb-build-fixer (attempt 2)

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 前回 escalation 4 件の解消確認

1. **Finding 1 (FAST/exempt off-by-one)** — operator が Accept 裁定。design.md R1 に「歯は発火し続ける」「exact 回数は受け入れ基準に無い」として記載済み（lines 181-184）。TC-006 が「発火すること」を固定し回数非依存の方針が明示されている。✓ 解消（Accept）

2. **Finding 2 (D1 "Approved verdict overturned" ブロックの副作用未記載)** — design.md D1 に `副作用(no-op)` 段落が追記されている（lines 89-92）。`Object.values(loopFixerPairs)` に implementer が入るが、全遷移表に `approved → implementer` 遷移が存在しないため実質 no-op である旨が明文化された。✓ 解消（Fix 適用済み）

3. **Finding 3 (T-05 alias 適用順序の未明示)** — tasks.md T-05 に「`from` 経路では `allowed.has()` 検証より**前**に適用する — alias 後の名前が検証対象」が追記されている（line 78）。実装者への指示として適用順序が明確になった。✓ 解消（Fix 適用済み）

4. **Finding 4 (IMPL_CODE_MUTATOR_STEPS 削除後の legacy state 挙動)** — operator が Accept 裁定。design.md D4「互換の既知の限界（許容）」に当該シナリオが文書化済み（lines 173-177）。実運用上発生困難であり alias + 後続 implementer 実行で自然解決されることが説明されている。✓ 解消（Accept）

### 修正後 canon の整合確認

5. design.md D1 の `副作用(no-op)` 追記が D1 の Rationale（`loopFixerPairs` 機構の維持）と論理的に整合する。approved→implementer 遷移の不在は前回レビューでコード確認済み（item 17）。✓

6. tasks.md T-05 の適用順序追記が design.md D4「既存 `mapMemberToCoordinator` の別名解決と同じ場所・同じパターン」と整合する。resolve-step.ts の `mapMemberToCoordinator` は `allowed.has()` の前段で適用されることを前回レビューで確認済み（item 9）。✓

7. Finding 1/4 の Accept 裁定が request.md 受け入れ基準と矛盾しないことを確認:
   - AC「ループ上限(RETRIES_EXHAUSTED)が再入方式でも機能する」= 歯の発火。回数一致は要求していない → Finding 1 Accept と矛盾なし ✓
   - AC「build-fixer 実行歴を含む既存 state の読み込みと resume が壊れない」= fold/resume の非破壊。legacy state での `codeChangedSinceLastVerification` 挙動変化は spec.md / AC が要求していない → Finding 4 Accept と矛盾なし ✓

### セキュリティ評価（前回からの変更なし）

8. 今回の operator 修正（design.md D1 / tasks.md T-05 への追記）はセキュリティ面に影響しない。追記はコメント・設計説明のみであり、入力バリデーション・認証・write-scope 制御には無関係。✓

---

## 検証できなかった項目

1. **`bun run typecheck && bun run test` の実際の実行** — spec-review step は source code read-only。typecheck 成否は実装フェーズで確定する。

2. **design.md D1 追記文の `approved → implementer` 遷移不在の動的実行確認** — 静的なコード確認（全遷移表の走査）で根拠は十分だが、runtime での動作確認は実装・test 実行フェーズで確定する。

---

## Findings 詳細

前回 escalation の 4 件は全て解消（Finding 2/3 は Fix 適用済み、Finding 1/4 は operator Accept 裁定）。新規 blocking finding なし。
