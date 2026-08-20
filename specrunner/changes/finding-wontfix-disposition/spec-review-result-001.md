# Spec Review Result: finding-wontfix-disposition

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### コード前提の突合（request.md の「現状コードの前提」）

| 前提 | 検証結果 |
|------|---------|
| `DecisionRecord` は decision-needed 専用の単一形（`types.ts:277-294`） | ✓ `selectedOption`, `source: "issue-comment"` のみ、`kind` discriminator なし |
| `computeFindingKey` = `step|file|line|normalized-title|normalized-rationale`（`decision-ledger.ts:32-38`） | ✓ 実装確認 |
| `isFindingDecided` / `filterUndecidedFindings` は step + findingKey のみで照合し record 種別を見ない（`decision-ledger.ts:49-72`） | ✓ `d.step === step && d.findingKey === key` のみ |
| `step-completion.ts:178,187,199,252` で `filterUndecidedFindings` が無条件に挟まっている | ✓ 4 箇所全て確認 |
| `collectFindingsLedger` per-step ループ内は source step 既知、dedupe 後は失われる | ✓ `for (const stepName of reviewerChain)` → `dedupeFindings(all)` |
| `computeRegressionLedger` が gate 入力（`regression-gate.ts:115,144`） | ✓ 確認 |
| `run-inbox.ts:293` が decisions の唯一の writer | ✓ inbox コメント経由の選択裁定のみ |
| `FlagDef` は string / boolean / integer のみ（array 未対応） | ✓ 確認 |
| `getLatestJudgeFindings` が利用可能（`fixer-helpers.ts:53-66`） | ✓ 確認 |
| `deriveImplReviewerChain(state)` = `["code-review", ...customReviewerNames]` | ✓ `reviewer-chain.ts:27-34` |
| `PrepareError(2)` と `appendOperatorAdjudication` が resume.ts のチョークポイントに実在 | ✓ `core/command/resume.ts:59-62, 296-302` |

### 設計の整合性検証

- **D1（discriminated union）**: `isFindingDecided` が kind を見ない実装を確認。disposition arm も既存照合機構で効く ✓
- **D2（comma-separated string flag）**: `FlagDef` の array 非対応と整合 ✓
- **D3（解決源 = gate StepRun、source step 逆引き）**: `getLatestJudgeFindings` の実装確認。gate が返す findings に `resolution: "decision-needed"` も含まれる点に注意（F-03 参照）
- **D4（all-or-nothing、exit 2）**: `PrepareError(2)` の既存パスが resume.ts に存在し再利用可能 ✓
- **D5（per-step 収集段階で除外）**: `collectFindingsLedger` に `state: JobState` が既存パラメータとして渡されており `state.decisions` へのアクセスはゼロコスト ✓
- **D6（verdict 側尊重 = 既存機構で成立）**: `step-completion.ts` の 4 箇所 `filterUndecidedFindings` 呼び出しを確認 ✓
- **D7（operatorAdjudications 無変更）**: `--prompt` と `--wontfix` の独立性は resume.ts の構造から自然に成立 ✓

### セキュリティ観点

- **プロンプトインジェクション（OWASP A03）**: `--prompt` text は `appendOperatorAdjudication` 経由で agent context に注入される（既存警告あり）。`--wontfix-reason` text は `DispositionDecisionRecord.reason` として `decisions` に格納されるのみ。`buildLedgerBlock`（gate prompt 生成）も `deriveOperatorAdjudicationContext`（round-context 注入）も `reason` field を読まず、agent prompt に到達しない。安全な設計 ✓
- **入力バリデーション**: 番号列はカンマ split → 整数検証 → 範囲チェックの 3 段。非整数・重複・空要素 → exit 2（all-or-nothing）。TC-014 / TC-017 でカバー ✓
- **権限制御（OWASP A01）**: decisions フィールドへの書き込みは resume コマンド経由のみ。既存 decisions と同一のアクセスモデル。新たな attack surface なし ✓

### spec.md の形式・内容

- 全 Requirement に SHALL/MUST の normative keyword を含む ✓
- 全 Requirement に Scenario（Given/When/Then）が存在する ✓
- 受け入れ基準の全 8 項目に対応する spec Scenario が存在する ✓

### test-cases.md

- TC 総数 18 件：spec シナリオ 13 件 + design/tasks 由来 4 件（TC-014〜TC-017）+ gate 1 件（TC-018）✓
- TC-001（後方互換）・TC-013（wontfix 無し resume）が既存動作保護として存在 ✓
- livelock 解消ケース（TC-010）が integration TC として存在 ✓
- StepRun / journal 不変確認（TC-011）が存在 ✓

---

## 検証できなかった項目

- `typecheck && test` の実行（コード未実装のため）
- `resolveWontfixDispositions` の実際の動作確認（関数未存在、T-02 の純関数設計を仕様レベルで評価するにとどまる）
- TC-005（--prompt + --wontfix 併用）の integration テスト動作確認（コード未実装）

---

## Findings 詳細

### F-01: tasks.md T-01 が `selectedOption` 非 narrowing 参照の修正対象ファイルを列挙していない

`DecisionRecord` を discriminated union に変更すると `selectedOption` は option arm 専用 field になる。以下 2 ファイルが ALL `state.decisions` を narrowing なしにマップしており、disposition record が `decisions` に混在した段階でコンパイルエラー（および `undefined.label` ランタイムクラッシュ）が発生する:

**`src/core/step/custom-reviewer-round-context.ts:198-204`**
```typescript
const decisions = (state.decisions ?? []).map((d) => ({
  selectedOption: d.selectedOption.label ?? "",   // disposition arm には selectedOption がない
  consequence: d.selectedOption.consequence ?? "", // 同上
}));
```

**`src/core/design-layer/topic-emission.ts:181`**
```typescript
const opt = matchedDecision.selectedOption;  // DecisionRecord 型で union narrowing なし
```

T-01 の Acceptance Criteria に「typecheck が green」が含まれているため typecheck で必ず検出される。ただし tasks.md が修正対象として両ファイルを列挙しておらず、実装者が自力で grep しなければならない。見落とし後に typecheck で発覚した場合、修正コストが上がる。

**推奨修正**: T-01 の確認対象に `custom-reviewer-round-context.ts` と `topic-emission.ts` を追記する。または Acceptance Criteria に「DecisionRecord 参照箇所を grep で全列挙し型 narrowing の完全性を確認」を明示する。

---

### F-02: tasks.md T-02 が「同一 step の複数 StepRun が同一 fingerprint を報告した場合のレコード数」を未定義

T-02 に以下の矛盾する記述が混在している:

- 「同一 fingerprint を複数 step が報告していれば**各 step につき 1 record**」（per-step）
- 「reviewerChain の各 step の**各 StepRun** の `collectFixableFindings` を走査」（per-StepRun）

`code-review` が 3 回実行（3 StepRun）され、全て同じ fingerprint の finding を報告した場合:

- per-StepRun で走査すると同一 step から複数の source-finding に当たる
- これらが同一 `findingKey`（rationale が同じ）なら重複 record が生成される
- 異なる `findingKey`（rationale が言い換えられた）なら全て必要なレコードとなる

仕様上 "各 step につき 1 record" が原則であれば、同一 step の複数 StepRun を走査する際は「最後に報告した StepRun の finding から 1 record 生成」か「各 StepRun の distinct findingKey ごとに 1 record 生成」のいずれかを明示する必要がある。現状では実装者が解釈を誤ると冗長または誤ったレコード数になる可能性がある。

**推奨修正**: T-02 に「同一 step 内では最終 StepRun（または各 distinct findingKey ごと）の finding から record を生成する」と明示する。

---

### F-03: `getLatestJudgeFindings` が `resolution: "decision-needed"` findings も返す点が --wontfix 操作の説明で未言及

`getLatestJudgeFindings(state, "regression-gate")` は gate の最後の StepRun の **全 findings** を返す。regression gate は regression（`resolution: "fixable"`）と contradiction（`resolution: "decision-needed"`）の両方を報告しうる。

operator が gate report の表示インデックスで contradiction finding（`resolution: "decision-needed"`）を `--wontfix 2` などで指定した場合、`collectFindingsLedger`（fixable findings のみ収集）に fingerprint が存在しないため逆引き不能 → exit 2 になる。

spec.md の "Unresolvable cases" に「fingerprint matches no step in the impl reviewer chain」として含まれているが、gate の decision-needed findings が「そもそも wontfix 対象外」であることは明示されていない。operators が誤操作した際のエラー診断が困難になりうる。

**推奨修正**: spec.md または design.md に「解決源から `resolution: "fixable"` のみを抽出してインデックスを構築する」か、「gate の decision-needed findings は wontfix 不可のため逆引き不能として exit 2 になる」と注記する。T-02 で `getLatestJudgeFindings` 後に `collectFixableFindings` フィルタを明示することも有効。

---

## Observations

### O-01: `state.decisions` の JSDoc コメントが union 化後に陳腐化

`src/state/schema/types.ts:484` のコメント `"records of decisions made for \`decision-needed\` findings"` は、discriminated union 化後は不正確（wontfix disposition も含む）になる。typecheck では検出されないため実装時に合わせて更新することを推奨する。

### O-02: `--wontfix-reason` の agent context 非注入はセキュリティ上有益だが spec に明示がない

`--wontfix-reason` text は `DispositionDecisionRecord.reason` として `state.decisions` に格納されるのみで、`buildLedgerBlock`（gate prompt）にも `deriveOperatorAdjudicationContext`（custom reviewer round-context）にも含まれない。プロンプトインジェクションリスクを追加しない安全な設計。ただし spec/design に明示がないため、将来の実装者が `reason` を agent context に追加する際に気づかずインジェクションリスクを導入する可能性がある。design.md の Risk/Trade-offs または Decisions に一行注記として残すことを推奨する。
