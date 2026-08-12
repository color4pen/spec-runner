# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 1. 現状コードとの前提整合

**`src/prompts/test-materialize-system.ts`**

- Line 92: `6. テストは意図的に red（fail）で構わない — 実装がまだ存在しないため。implementer が green にする。` ← request.md の前提と一致 ✅
- Evidence 節 lines 98–102: 変換 TC ID 列挙・実装不可能 TC の明示・TC ID 含有確認のみ。テスト実行結果の記録要求はない ← request.md の前提と一致 ✅
- Method Step 3 (lines 63–86): 既存テストが TC を充足する場合 → トレーサビリティコメント追記。design.md D2 の `expected-green` 分類の正当性根拠 ✅

**`src/core/step/test-materialize.ts`**

- Line 30-33: `tools: [{ type: AGENT_TOOLSET_TYPE }]` ← agent_toolset_20260401。shell 実行が可能。design.md の「実行手段は implementer / build-fixer と同じ知識で足りる」の前提を裏付ける ✅
- Lines 111-117: `resultFilePath()` が `null` を返す ← design.md D3「記録先は完了報告（Evidence）」の根拠 ✅

**`src/core/pipeline/types.ts` lines 248-254**

- `IMPLEMENTER → BITE_EVIDENCE on success` / `BITE_EVIDENCE → VERIFICATION on strategy-deferred` ← request.md の「機械側の見張り確認は strategy-deferred で素通りする」前提と一致 ✅

### 2. spec.md の規格準拠確認

- 全 Requirement が `### Requirement:` ヘッダーを持つ ✅
- 全 Requirement に少なくとも 1 つの `#### Scenario:` ✅
- Requirement 本文に `MUST` / `SHALL NOT` 等の normative keyword ✅
- Given/When/Then 形式 ✅

### 3. request.md 要件 ↔ spec.md Scenario 対応

| request.md 要件 | spec.md Scenario | 対応 |
|---|---|---|
| 要件 1: 実行と fail 観測の義務化 | Scenario「prompt に実行と red 観測の指示が含まれる」 | ✅ |
| 要件 2: 期待分類の導入 | Scenario「prompt に期待分類と一致確認の指示が含まれる」 | ✅ |
| 要件 3: 観測記録の義務化 | Scenario「Evidence 節に観測記録の指示が含まれる」 | ✅ |
| 受け入れ基準「既存テストが無変更で green」 | Requirement 4 + Scenario | ✅ |

### 4. design.md 設計判断の整合性

- D1（Method Step 6 置換）← 要件 1 直結。既存 Step 6 の受動許容文を能動義務に置き換える記述が明確 ✅
- D2（expected-red / expected-green 分類）← 要件 2 直結。全新規テストへ一律 red を要求しない根拠（Step 3 の green 経路を保護）が明示 ✅
- D3（Evidence 追記 + 記録先の読み替え）← 要件 3 の "result file に記録" を完了報告（Evidence）へ読み替えた根拠が明確。`resultFilePath()` が `null` であることが裏付け ✅
- D4（discriminator 規律）← tasks.md の「discriminator 規律」節と一致。base 不在リテラル (`expected-red` / `expected-green`) を assertion に使うことで本 request の欠陥型の再発を防ぐ設計 ✅

### 5. tasks.md のタスク定義確認

- T-01: Method Step 6 置換の詳細・`expected-red`/`expected-green` 定義・不一致時の完了不可条件が具体的 ✅
- T-02: Evidence 節追記の項目が spec.md Scenario 3 の Then 節と対応 ✅
- T-03: `typecheck && test` が green ← 受け入れ基準と一致 ✅
- 「既存テストファイルを編集せず別ファイルに置く」制約が T-01 / T-02 両方に明記 ✅
- 破壊確認（T-01 の Step 6 置換を一時的に戻すと red になること）が tasks.md に明記 ✅

### 6. 5 節骨格の保護確認

新規追記がすべて `## Method` / `## Evidence` の内側に散文 / bullet で置かれ、新規 h2 を作らないという制約が:
- tasks.md T-01 制約に明記 ✅
- tasks.md T-02 制約に明記 ✅
- spec.md Requirement 1 / 2 / 3 に `SHALL NOT` で明記 ✅
- 既存の `test-materialize-prompt-contract.test.ts` TC-003「Method 節に新規 h2 見出しを追加しない」が regression guard として機能 ✅

### 7. セキュリティ考慮事項

- 本変更は `src/prompts/test-materialize-system.ts` のテキスト（system prompt 文言）のみを変更する
- 外部入力をプロンプトに直接埋め込む変更はなく、prompt injection のリスク増大はない
- `buildTestMaterializeInitialMessage` の `requestContent` 埋め込みは既存設計であり本変更のスコープ外
- OWASP Top 10 観点での新規リスクは存在しない

## 検証できなかった項目

None — 全 4 成果物と参照先ソースを確認済み。

## Findings 詳細

### [Observation] buildTestMaterializeInitialMessage の user message に古い受動表現が残る

`src/prompts/test-materialize-system.ts` line 149:

```
The tests will intentionally fail (red) — implementation does not exist yet.
```

T-01 で system prompt の Method Step 6 が能動的義務（「実行し fail を観測してから完了する」）に置換される一方、initial user message のこの行は tasks.md のスコープ外（「変更対象は system prompt 文言のみ」）とされており変更されない。

この 2 つは**矛盾しない**（user message は既成事実を述べており、実行を禁じていない）が、変更後は system prompt の能動義務化と user message の受動記述が共存し、将来のメンテナンス時に読み手を混乱させる可能性がある。

実害は small（agent は system prompt の義務化指示を優先する）であり、blocking ではない。将来の cleanup 候補として記録する。

severity: low
