# Spec Review Result — finding-wontfix-disposition (iteration 002)

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 前周指摘の解消確認

#### [high] T-01: DecisionRecord.selectedOption 非 narrowing 参照の修正対象ファイル未列挙

- **現状確認**: tasks.md T-01 に `src/core/step/custom-reviewer-round-context.ts:198-204` と
  `src/core/design-layer/topic-emission.ts:181` の両ファイルが明示的に列挙されている。
- **ソース照合**:
  - `custom-reviewer-round-context.ts:198-204` の `d.selectedOption.label` は
    disposition record（selectedOption なし）で実行時クラッシュする実 issue であることをコード読取で確認
    （現時点では union 未導入のため問題は潜在状態）。
  - `topic-emission.ts:181` の `matchedDecision.selectedOption` も同様に narrowing 不在。
  - 両ファイルとも design.md の Risk 節にも列挙済み。
- **判定**: ✓ 解消

#### [medium] T-02: 同一 step の複数 StepRun から生成するレコード数の未定義

- **現状確認**: tasks.md T-02 に「同一 step 名を持つ複数の StepRun が同一 fingerprint を報告していても、
  その step につき 1 record のみ生成する（最初に見つかった StepRun の finding を代表値として使用）」が追記された。
  design.md D3 の「各 source step につき 1 record」とも整合している。
- **判定**: ✓ 解消

#### [low] getLatestJudgeFindings が decision-needed findings も返す点が未言及

- **現状確認**: spec.md「解決不能な --wontfix は exit code 2 で停止し decisions を変更しない」要件の直下に
  Note が追加され、「gate は fixable と decision-needed の両方を報告しうる。decision-needed 由来の
  fingerprint は reviewerChain に一致しないため exit 2 になる」旨が説明されている。
  `getLatestJudgeFindings` の実装（`fixer-helpers.ts:53-66`）が全 findings を返すことと整合する説明。
- **判定**: ✓ 解消

---

### 全量レビュー（今回確認済み）

#### spec.md — Requirement / Scenario の正確性

| 確認観点 | 結果 |
|--------|------|
| `kind` 無しの既存 record が option として読める後方互換設計 | ✓ planner.ts:329 の `kind` なし record が optional discriminant で option arm として typecheck 通る設計と整合 |
| disposition record の必須フィールド定義 | ✓ `kind:"disposition"` / `step`（発生元）/ `findingKey` / `finding` / `disposition:"wontfix"` / `reason` / `decidedAt` / `source:"operator"` が明示 |
| 逆引きロジック（fingerprint → source step）の定義 | ✓ spec.md と design.md D3 / tasks.md T-02 が一致 |
| all-or-nothing 記録の保証 | ✓ spec.md Requirement + design.md D4 で exit code 2 + decisions 無変化を宣言 |
| `collectFindingsLedger` での per-step 除外（D5） | ✓ `state: JobState` を既に受け取るため signature 変更なし。design.md D5 / tasks.md T-04 と整合 |
| `filterUndecidedFindings` が kind を見ずに step+findingKey 照合する事実確認 | ✓ `decision-ledger.ts:49-56` が `d.step` と `d.findingKey` のみ参照し kind を参照しないことを直接確認 |
| verdict 側の尊重が既存 `filterUndecidedFindings` で成立すること | ✓ `step-completion.ts:178,187,199,252` で無条件に `filterUndecidedFindings` が挟まれることをコード読取で確認 |
| `--prompt` と `--wontfix` 独立動作 | ✓ spec.md Scenario で明示、design.md D7 でも確認 |
| `REGRESSION_GATE_STEP_NAME` の export 確認 | ✓ `regression-gate.ts:38` で export されている |
| `findingFingerprint` の export 確認 | ✓ `findings-ledger.ts:162` で export されている |
| `collectSpecReviewLedger` が disposition 除外を必要としない根拠 | ✓ disposition record の `step` は必ず reviewerChain step（`["code-review", ...customs]`）。spec-review step は reviewerChain に含まれないため spec-review ledger への影響なし |
| TC-018（gate TC）の検証コマンドが verification step に対応 | ✓ `typecheck && test` が verification phase の commands と一致 |

#### test-cases.md — カバレッジ確認

| TC | Source | 優先度 | 評価 |
|----|--------|--------|------|
| TC-001〜TC-013 | spec.md Scenario 由来 | must | ✓ must 受け入れ基準を網羅 |
| TC-014 | design.md D4（非整数） | must | ✓ tasks.md T-02 と整合 |
| TC-015 | design.md D3（逆引き不能） | must | ✓ tasks.md T-02 と整合 |
| TC-016 | design.md D2（カンマ parse） | should | ✓ 正常系 parse の動作固定 |
| TC-017 | tasks.md T-02（重複・空要素） | should | △ F-001 参照 |
| TC-018 | tasks.md T-06（gate TC） | must | ✓ verification phase |

Summary カウント整合: Total 18, Automated 17, Manual 0, must 16, should 2 — 計算一致 ✓

---

## 検証できなかった項目

| 項目 | 理由 |
|------|------|
| gate 報告 findings の escalation 表示での 1-based 番号付き列挙 | `buildFindingsBlock` は番号なしヘッダー形式（`### [SEV] title`）。operator が `--wontfix <番号>` を使うには escalation 表示に番号が必要だが、CLI/表示層の設計は本 spec のスコープ外で実装時確認が必要 |
| `resolveWontfixDispositions` の循環 import 不在 | 新規ファイル未実装のため、wontfix.ts → step/pipeline 方向の一方向性は実装時に検証が必要 |

---

## Findings 詳細

### F-001: spec.md が重複インデックスをエラー条件として定義していない

tasks.md T-02 は「非整数・重複・空要素はエラー」と明記し、TC-017（should）が
「`--wontfix "1,,1"` は exit 2」をテストする。しかし spec.md「解決不能な --wontfix」要件の
「Unresolvable cases include:」列挙に重複インデックスおよび空要素が含まれていない。
design.md D4 の解決不能条件列挙にも同様の言及がない。

実装者が「重複を許容してサイレントに dedup する」と解釈しても spec との矛盾が生じない。
TC-017 は「should」で tasks.md 由来のため、spec が沈黙している限り実装の裁量範囲として
処理される可能性がある。

**fix**: spec.md「解決不能な --wontfix」要件の Unresolvable cases 列挙に
「a number list containing empty elements or duplicate indices」を追加する。
