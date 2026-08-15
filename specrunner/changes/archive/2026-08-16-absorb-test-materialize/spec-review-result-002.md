# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだファイル

- `request.md` — 要件・受け入れ基準・architect 評価済み設計判断を通読
- `spec.md` — 全 Requirement / Scenario を通読（TC-015a の新規 Scenario を確認）
- `design.md` — D1〜D6 の全 Decision と spec-fixer-deferred コメント（line 174）を通読
- `tasks.md` — T-01〜T-11 を通読（T-02 に state/schema/types.ts・config/schema/types.ts が追加されたことを確認）
- `test-cases.md` — TC-001〜TC-018（TC-015a 含む）を通読、Summary/Result の count を検算

### 前周指摘の解消確認

**Finding-1（TC-015 materializedTestFiles 独立性）**:
- spec.md に "Scenario: materializedTestFiles が空でも testDerivation は frozen（D4 独立性）" が追加された（lines 75-79）✓
- test-cases.md に TC-015a が追加された（lines 188-194）✓。Source 参照は spec.md の当該 Scenario を正しく指している ✓
- tasks.md T-10 が "TC-015a として…ケースを追加する" を achieved-assurance.test.ts 更新の一部として明示している ✓
- 指摘解消 ✓

**Finding-2（T-02 doc scrub に state/schema/types.ts・config/schema/types.ts が不在）**:
- tasks.md T-02 に `src/state/schema/types.ts` の commitOid doc comment 更新（line 23）✓
- tasks.md T-02 に `src/config/schema/types.ts` の staging-containment doc comment 更新（line 24）✓
- 指摘解消 ✓

### 全量再検証

**要件 1（遷移の置換） → D1 / TC-001〜004 / T-03**:
- spec.md が 4 Scenario（非免除・免除・遷移表に行なし・spec-fixer forward）を保持 ✓
- TC-001〜004 がそれぞれ正しく Source 参照 ✓
- D1 の unconditional row への包摂論理（isTestGenExempt guard の削除・specFixerForwardsToImplementer 廃止）を追跡し一貫性を確認 ✓

**要件 2（implementer 単一 mode） → D2 / TC-005〜006 / T-04**:
- spec.md の 2 Scenario（prompt 責務明示・message が state.steps["test-materialize"] で分岐しない）が双方向 pin ✓
- TC-005 の THEN は "実体化責務を含む" AND "implement-only mode の分岐記述を含まない" の両方を pin ✓

**要件 3（file-set EB-native 化） → D3 / TC-007〜008 / T-05〜06〜07**:
- spec.md の 2 Scenario（gate baseOid 不在で red→green・floor baseOid 不在で判定到達）が新 primitive `listChangedFilesBetweenCommits` の意味論と整合 ✓
- TC-013（LocalRuntime 実装）・TC-014（ManagedRuntime unavailable）が D3 の runtime primitive 変更を固定 ✓

**要件 4（testDerivation 意味論再定義） → D4 / TC-015・015a・016 / T-07**:
- spec.md に 3 Scenario（intact → frozen、materializedTestFiles 空でも frozen、すり替え → absent）✓
- D4 の "blob freeze 廃止・scenario revision binding のみ" との整合 ✓
- STANDARD_PROFILE.assurance.testDerivation = "frozen" の floor 据え置きが D4 に明記 ✓

**要件 5（削除と互換） → D5 / TC-009〜011 / T-02・09**:
- T-02 の削除リストに設計 D5 の全 deletion target（step-names・agent union 以外は D5、それらは T-01）が含まれていることを確認 ✓
- T-09 の legacy alias（test-materialize → IMPLEMENTER）が absorb-build-fixer と同一パターン ✓

**要件 6（exemption 縮退） → D1 / TC-012 / T-03**:
- isTestGenExempt の残存 2 箇所（design → spec-review / implementer → verification）が D1 で明示 ✓

**受け入れ基準の全網羅確認**:
- 全 8 受け入れ基準が TC（または design.md のテスト更新列挙）で固定されていることを確認 ✓
- 列挙外テストの無変更 green を design.md「テスト更新対象の全列挙」で根拠付き担保 ✓

**Summary / Result count の検算**:
- TC-001〜018 + TC-015a = 19 total ✓
- unit/integration: 17（gate 2 を除く）✓
- must: 18、should: 1（TC-014）✓

**セキュリティ**:
- 新 primitive `listChangedFilesBetweenCommits` に渡る OID は resolveEvidenceBaseRev / captureHeadSha 由来（システム内部）であり、ユーザー入力の直接流入なし ✓
- prompt 変更（mode 分岐削除）は injection ベクタを導入しない ✓
- CLI ツールであり Web / ネットワーク露出面なし。OWASP Top 10 の適用領域外 ✓

## 検証できなかった項目

- state/schema/types.ts の compile guard が実際に "test-materialize" を含む型推論をしていること（tsc 実行不可）
- managed runtime の `listChangedFilesBetweenCommits` 実装パターンの実際の動作（実行環境外）
- gate.ts の step 順再編後に runtime capability check が正しい順序で評価されること（実行確認不可）

## Findings 詳細

### Finding-1: tasks.md T-10 の "(test-cases.md にも TC-015a として追記する)" が redundant で duplicate リスクを持つ（LOW / fixable）

**場所**: `tasks.md` T-10、138 行目

**内容**: T-10 は `achieved-assurance.test.ts` への TC-015a 追加と合わせて "（test-cases.md にも TC-015a として追記する）" と指示している。しかし TC-015a は既に test-cases.md に存在する（lines 188-194）。implementer がこの指示を文字通り実行すると test-cases.md に TC-015a が二重登録され、Summary/Result の count と不整合が生じる。

**根拠**: design.md line 174 の spec-fixer-deferred コメントは "spec-fixer の write scope が test-cases.md を含まない" として TC-015a の test-cases.md への追記を implementer に委譲したが、実際には test-cases.md に TC-015a が既に存在する（test-case-gen によって生成済みと考えられる）。コメントは追記不要の状況を反映していない。

**推奨対応**: T-10 line 138 の括弧内指示を "TC-015a は既に test-cases.md に存在するため、achieved-assurance.test.ts への実コード追加のみ実施する" に変更する。または括弧部分を削除して誤解の余地をなくす。機能への影響はなく、implementer が test-cases.md を読めば重複を避けられるが、明示的に修正する方が安全。
