# Code Review Feedback — test-materialize-red-check — Iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## Scope

- **Branch**: `change/test-materialize-red-check-d757d7b0`
- **Source files changed**: `src/prompts/test-materialize-system.ts` (+13 lines, -1 line)
- **Test files added**: `tests/unit/prompts/test-materialize-red-check-contract.test.ts` (+332 lines)
- **Existing test files modified**: なし（prompt-contract / manual-scope-contract / gate-scope-contract の git diff は空）

---

## 検証した項目

### 受け入れ基準の確認

| 基準 | 状態 |
|------|------|
| system prompt に「実行し fail を観測してから完了する」指示 — テストで固定 | ✅ TC-001 passes; prompt line 96 に義務記述あり |
| system prompt に `expected-red` / `expected-green` の期待分類と一致確認 — テストで固定 | ✅ TC-002 passes; prompt lines 93-98 |
| Evidence 要求に観測記録（コマンド・ファイル・件数・分類）— テストで固定 | ✅ TC-003 passes; prompt lines 108-113 |
| 既存テストが無変更で green | ✅ 3 ファイルの git diff が空 |
| `typecheck && test` が green | ✅ verification-result.md: 全 phase passed（756 test files, 11312 tests） |

### TC-006 破壊確認（Manual Must）

tasks.md は「verification / code-review の過程で確認し、歯の実在（fail-open でないこと）を証明する」と指定している。
code-review として以下を確認した。

**main ブランチ（変更前）の Step 6**:
```
テストは意図的に red（fail）で構わない — 実装がまだ存在しないため。implementer が green にする。
```

**新規テスト（TC-001/002/003）の discriminator literals と、旧 prompt への存在確認**:

| リテラル | TC | main ブランチ（変更前）に存在するか |
|---------|----|------------------------------------|
| `完了報告`（## Method 節内） | TC-001 | なし（## Completion にのみ存在） |
| `観測`（## Method 節内） | TC-001 | なし |
| `書き直して` / `何も見張っていないテスト` | TC-001 | なし |
| `裁量`（## Method 節内） | TC-001 | なし |
| `expected-red` | TC-002 / TC-003 | なし |
| `expected-green` | TC-002 / TC-003 | なし |
| `実行したコマンド`（## Evidence 節） | TC-003 | なし |
| `対象テストファイル`（## Evidence 節） | TC-003 | なし |
| `観測結果`（## Evidence 節） | TC-003 | なし |

`git show main:src/prompts/test-materialize-system.ts | grep -n "完了報告\|観測\|裁量\|expected-red\|..."` → **none found**

TC-001 / TC-002 / TC-003 の assertion はすべて変更前 prompt に対して fail する（`expected-red` として歯が実在する）。
TC-006 破壊確認は code-review として論理的に確認済み。

### 実装の詳細確認

- **Method Step 6 の置換**: 旧「テストは意図的に red（fail）で構わない」1 行が、`expected-red`/`expected-green` の 2 分類定義 + 観測義務（3 段落）に完全置換されている。既存 Step 1〜5 および manual/gate スキップ block は無改変。
- **Evidence 節の追記**: 既存 3 行（TC ID 列挙・実装不可能 TC の明示・TC ID 含有確認）を保持したまま、観測記録の 5 項目が bullet で追記されている。新規 h2 見出しは追加されていない。
- **5 節骨格の維持**: Question / Contract / Method / Evidence / Completion の順序が維持されていることをテスト（TC-001, TC-004）が固定している。
- **新規テストファイル**: discriminator rationale（test file lines 13-25）で、各 assertion が変更前 prompt に存在しないリテラルを使っていることが文書化されている。D4 規律を遵守。
- **"result file" 不使用**: Evidence 節に "result file" という文言が含まれていないことを TC-005 が固定している。

## 検証できなかった項目

None — TC-006 は論理的に確認済み（上記参照）。

## Findings 詳細

### F-001: 初期ユーザーメッセージの受動的フレーミングが system prompt の義務と不整合 [Low]

**ファイル**: `src/prompts/test-materialize-system.ts`
**箇所**: `buildTestMaterializeInitialMessage` 関数、lines 161-162

```
The tests will intentionally fail (red) — implementation does not exist yet.
The next step (implementer) will write the implementation to make them green.
```

**問題**: 初期ユーザーメッセージが「テストは intentionally fail して構わない」という受動的記述のままである。
system prompt の Method Step 6 は「完了報告の前に実行し fail を観測してから完了する」という能動的義務を規定しているが、
ユーザーメッセージの文言が旧フレーミングを維持しており、agent が「観測は不要、失敗するのは当然」と解釈する
余地を与えかねない。

system prompt が優先されるため merge-blocking ではないが、
両者が整合していると agent の従順性が高まる。

**修正案（任意）**:
```
New tests MUST be run before completing — confirm they fail (red) as expected (implementation does not yet exist).
The next step (implementer) will write the implementation to make them green.
```

または当該 2 行を削除して system prompt の指示に委ねる。
