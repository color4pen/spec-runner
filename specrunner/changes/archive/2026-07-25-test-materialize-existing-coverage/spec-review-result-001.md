# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだファイル

- `specrunner/changes/test-materialize-existing-coverage/request.md`
- `specrunner/changes/test-materialize-existing-coverage/design.md`
- `specrunner/changes/test-materialize-existing-coverage/spec.md`
- `specrunner/changes/test-materialize-existing-coverage/tasks.md`
- `src/core/verification/test-coverage.ts`（全体）
- `src/prompts/test-materialize-system.ts`（全体）
- `src/core/step/test-materialize.ts`（全体）
- `src/core/step/write-scope.ts`（冒頭 50 行）
- `src/templates/step-output-templates.ts`（冒頭 50 行 + 110-135 行）
- `docs/test-coverage.md`（全体）
- `docs/README.md`（全体）
- `docs/guarantees.md`（全体）
- `tests/unit/core/verification/test-coverage.test.ts`（抜粋）
- `tests/unit/core/verification/test-coverage-comment-form.test.ts`（全体）
- `tests/unit/prompts/test-materialize-prompt-contract.test.ts`（全体）
- `tests/unit/docs/test-coverage-docs-contract.test.ts`（全体）

### 現状コードの前提（request.md）の検証

| 主張 | 確認結果 |
|---|---|
| `extractMustTcIds` は `**Priority**: must` のみで判定し Category を参照しない | ✓ 確認。`priorityMustRe` のみ、Category チェックなし（lines 95-135） |
| `test-materialize.ts` の `outputContracts()` が test-coverage 契約を宣言 | ✓ 確認（lines 87-97） |
| `write-scope.ts` test-materialize が GUARDED_WRITE_STEPS に含まれる | ✓ 確認（line 37） |
| prompt に「既存テストが TC を充足している場合の指示が存在しない」 | ✗ 不一致。現行コードの Step 3（lines 61-70）にはトレーサビリティコメント手順が既に存在する。design.md の Context が説明する「先行変更」で実装済み |

### design.md「先行変更が既に実装済み」の検証

design.md Context が「先行変更で既に実装済み」と主張する要素を確認:

| 要素 | 確認結果 |
|---|---|
| `src/prompts/test-materialize-system.ts` Step 3（トレーサビリティコメント手順） | ✓ 存在（lines 61-70） |
| `docs/test-coverage.md`（トレーサビリティ規約） | ✓ 存在・内容適切 |
| `tests/unit/prompts/test-materialize-prompt-contract.test.ts` | ✓ 存在（TC-001〜TC-003） |
| `tests/unit/core/verification/test-coverage-comment-form.test.ts` | ✓ 存在（TC-004〜TC-005） |
| `tests/unit/docs/test-coverage-docs-contract.test.ts` | ✓ 存在（TC-006〜TC-007） |

### D1 設計の正確性検証（extractMustTcIds Category: manual 除外）

- `currentIsManual` フラグを `currentIsMust` と並べ、同一スコープに置く設計 → `flushCurrent` クロージャが正しくアクセス可能 ✓
- `flushCurrent` 条件 `currentTcId && currentIsMust && !currentIsManual` → Category なしの must TC は `currentIsManual = false` のまま従来どおり push される ✓
- エッジケース（テンプレート enum 行 `**Category**: unit | integration | manual`）:
  - `src/templates/step-output-templates.ts:123` で確認。HTML コメント（FORMAT REQUIREMENTS）内に存在し、最初の `## TC-` section よりも前のため、どの TC section にも属さない ✓
  - 加えて regex はコロン直後に `manual` を要求するが、当該行のコロン直後は `unit` ✓
  - 誤除外は起きない ✓

### spec.md と request.md の対応確認

| request.md 要件 | spec.md 対応 |
|---|---|
| 要件 1（トレーサビリティコメント手順） | 先行変更済み。spec 不要 ✓ |
| 要件 2（test-cases.md 側は新フィールドなし） | スコープ外として明記 ✓ |
| 要件 3（docs 明文化） | spec.md 要件 3「docs は manual TC の coverage 集計除外を明文化する」✓ |
| 要件 4（走査方式維持） | スコープ外として明記 ✓ |
| 要件 5（extractMustTcIds manual 除外） | spec.md 要件 1「test-coverage は Category: manual の must TC を coverage 集計から除外する」✓ |
| 要件 6（prompt manual 対象外の明記） | spec.md 要件 2「test-materialize prompt は manual TC を自動テスト化・トレーサビリティコメントの対象外とする」✓ |

### spec.md Scenario → tasks.md 対応確認

| spec.md Scenario | tasks.md タスク |
|---|---|
| Scenario: manual かつ must の TC → missing にならない | T-01 + coverage manual 除外 fixture ✓ |
| Scenario: unit / integration must TC は従来と同一 | T-01 AC（回帰）+ fixture 内回帰ケース ✓ |
| Scenario: prompt が manual TC 対象外の記述を含む | T-02 + prompt manual-scope contract ✓ |
| Scenario: docs が manual 除外規約を含む | T-03 + docs manual contract ✓ |

### guarantees.md への影響

manual 除外は「coverage gate が要求するものはすべて自動テストで充足可能」に揃える変更。
`docs/guarantees.md` の G1-1〜G1-6 はいずれも verdict 導出・gate skip・credential・conformance に関する保証であり、
test-coverage の集計対象（manual 除外）に言及する保証項目は存在しない。
版号変更不要という design.md の判断は正しい。

### セキュリティ確認

- system prompt 変更は静的テキストの追加のみ。動的ユーザー入力は増えない ✓
- regex `/\*\*Category\*\*:\s*manual/` は単純リテラル走査。ReDoS 危険性なし ✓
- `test-cases.md` は agent が生成する内部ファイル。外部公開 API 経由の入力ではない ✓
- OWASP Top 10 に該当する変更面なし ✓

### 新規テストファイルの状況確認

| ファイル | 状態 |
|---|---|
| `tests/unit/core/verification/test-coverage-manual-exclusion.test.ts` | 未存在（test-case-gen が採番・test-materialize が materiailze する設計）✓ |
| `tests/unit/prompts/test-materialize-manual-scope-contract.test.ts` | 未存在（同上）✓ |
| docs manual contract テストファイル（名称未定） | 未存在（tasks.md で名称が未特定）→ Findings 参照 |

## 検証できなかった項目

- `src/core/runtime/local.ts:1329`（`evaluateTestCoverage` 呼び出し経路）を直接読まず。design.md の主張「2 つの消費者が共に `extractMustTcIds` を経由する」を `test-materialize.ts` の `outputContracts()` → `test-coverage` contract の構造から間接的に確認した。直接読んで `evaluateTestCoverage` 呼び出しを目視確認する手順はスキップした。

## Findings 詳細

### F-01: tasks.md の docs manual contract テストのファイル名が未特定

tasks.md の「テストの取り扱い」節で coverage manual 除外 fixture と prompt manual-scope contract には明示的なファイル名が与えられているが、docs manual contract テストには「新規テストファイル（既存 docs-contract を壊さない追加）」とだけあり、ファイル名が未特定。他 2 件と同様に具体的なファイル名（例: `tests/unit/docs/test-coverage-manual-contract.test.ts`）を指定すべき。

命名一貫性の観点から低優先度の修正対象。test-case-gen・test-materialize が自律的にファイル名を決定すれば実害はないが、tasks.md を参照する実装者（または agent）の判断を増やす。

### F-02: request.md「現状コードの前提」の一部がスタッル（情報のみ）

request.md の「現状コードの前提」に「test-materialize-system.ts — 既存テストが TC を充足している場合の指示が存在しない（既存テストの参照は配置パターン確認の文脈のみ: :61 / :117）」と記述されているが、現行コードには Step 3（lines 61-70）にトレーサビリティコメント手順が既に存在する。design.md の Context が「先行変更で実装済み」として正確に説明しているため、spec.md と tasks.md のスコープは正しい。request.md 自体は変更不要だが、レビュアーは request.md のベースライン記述が先行変更適用前の状態を指す点を認識する必要がある。
