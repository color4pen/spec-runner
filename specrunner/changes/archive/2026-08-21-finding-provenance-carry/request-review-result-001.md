# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### Step 1: コードアサーション検証

**`src/core/decision/wontfix.ts:85-117`**

実際に読んで確認。ファイル全体を Read した結果:
- Line 87: `const reviewerChain = deriveImplReviewerChain(state);` — impl reviewer chain のみを参照
- Lines 89-110: fingerprint → Map\<stepName, Finding\> の索引を impl reviewer chain の findings から構築
- Line 117: `const stepMap = chainIndex.get(fp);` — gate finding の fingerprint で逆引き
- Lines 118-122: `if (!stepMap || stepMap.size === 0)` → all-or-nothing で `exit 2` のエラーを返す

記述の正確性: ✅ 行番号は 85-117 でおおよそ正確（実際には resolution loop は 112-147 まで続くが、核心の「索引構築 + 逆引き失敗条件」は range 内に収まる）。spec-review を含まない点も正確に記述されている。

**`src/core/pipeline/findings-ledger.ts:124-218`**

実際に読んで確認:
- Line 138: `collectSpecReviewLedger` — spec-review 全 StepRun の fixable findings を収集
- Line 212: `computeRegressionLedger` — `collectSpecReviewLedger` + `collectFindingsLedger` を `dedupeFindings` で合流
- Line 218-219: `return dedupeFindings([...specLedger, ...implLedger]);`

記述の正確性: ✅ 「ledger は spec-review と impl reviewer chain を dedupeFindings で合流する」は正確。

**重要な非記載事項の発見**: `collectFindingsLedger`（Line 55）は `filterUndecidedFindings` を呼んで disposition-決定済み findings を除外する。一方 `collectSpecReviewLedger`（Lines 138-162）には `filterUndecidedFindings` の呼び出しが**存在しない**。この非対称性は「現状コードの前提」に記載されていない。

**`src/state/schema/types.ts` — `DecisionRecord` union**

実際に読んで確認:
- Line 332: `export type DecisionRecord = OptionDecisionRecord | DispositionDecisionRecord;`
- `OptionDecisionRecord`（Lines 277-296）、`DispositionDecisionRecord`（Lines 302-321）ともに確認済み
- `JobState.decisions?: DecisionRecord[]`（Line 528）— フィールド名 `decisions` の永続形式も確認

記述の正確性: ✅

**regression-gate が LLM step であること**

`src/core/step/regression-gate.ts` の `buildMessage` を確認:
- ledger を `buildLedgerBlock(ledger)` でテキストとして LLM に渡す（Line 146）
- LLM が `report_result` で findings を再報告する構造（Line 79-80）
- 元 finding の title / rationale を verbatim に保持する契約は存在しない（実装上の契約なし）

記述の正確性: ✅

### Step 2: 要件・受け入れ基準の評価

- AC-1（title 言い換え後の `--wontfix` 成功）: 明確かつテスト可能
- AC-2（spec-review 由来 finding の `--wontfix` 成功）: 明確かつテスト可能
- AC-3（不正 index / 由来不明で exit 2 継続）: 明確かつテスト可能
- AC-4（機械尊重の継続テスト）: 一見明確だが、後述の gap あり
- AC-5（既存テストの更新許容範囲）: 記述が曖昧
- AC-6（`typecheck && test` green）: 標準要件

### Step 3: テスト既存状況の確認

`tests/unit/core/decision/wontfix.test.ts` を確認:
- TC-015（fingerprint 逆引き不能で exit 2）: 「title 文字列照合」にあたる最有力テスト
- TC-003/002（disposition record 構造）: gate finding と chain finding が同一オブジェクト → 暗黙に fingerprint 一致を前提とする
- TC-004（同一 fingerprint × 複数 step）: 同様
- TC-016（カンマ区切り parse）: 同様

## 検証できなかった項目

None（コードアサーション・要件・受け入れ基準の全項目を直接コードで確認した）

## Findings 詳細

### Finding 1（medium）: `collectSpecReviewLedger` に `filterUndecidedFindings` が欠落

「現状コードの前提」は `findings-ledger.ts:124-218` の説明で `collectSpecReviewLedger` と `collectFindingsLedger` の合流に言及するが、両者の重要な非対称性を記載していない:

- `collectFindingsLedger`（line 55）: `filterUndecidedFindings(stepName, fixable, state.decisions)` を呼び、disposition 決定済み findings を除外する
- `collectSpecReviewLedger`（lines 138-162）: `filterUndecidedFindings` の呼び出しが存在しない

AC-4（「ledger 除外」が新しい解決方式でも機能する）を spec-review 由来 finding について満たすには、`collectSpecReviewLedger` に `filterUndecidedFindings` 呼び出しを追加する必要がある。この現状の gap が「現状コードの前提」に記載されておらず、実装者が見落とす可能性がある。

現状コードが非対称な理由も説明可能（spec-review findings は現在 wontfix 不能なため除外不要だった）が、本 request 実装後は必須の変更となる。

### Finding 2（low）: AC-5「title 文字列照合を pin するケース」の特定が曖昧

AC-5 は「`tests/unit/core/decision/wontfix.test.ts` の『title 文字列照合』を pin するケースに限り新契約への更新を許容する」とするが、具体的にどのテストケースが該当するか明示していない。

TC-015 は明確に fingerprint 逆引きの失敗をテストする候補だが、TC-003/TC-004/TC-016 も gate finding と chain finding に同一オブジェクトを使用しており、暗黙に fingerprint 一致を前提としている。新設計では gate finding が title を書き換えた場合のテストを追加することが主眼であり、既存テストの更新範囲については実装者の判断に委ねられる形になっている。
