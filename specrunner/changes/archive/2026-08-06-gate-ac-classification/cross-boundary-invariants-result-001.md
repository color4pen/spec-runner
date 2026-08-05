# Cross-Boundary Invariants Review — gate-ac-classification — iter 1

## 検証した項目

### 1. `extractMustTcIds` の新経路 — adjacent mechanism との整合

**変更内容**: `extractMustTcIds` に `currentIsGate` フラグと `categoryGateRe` を追加し、`flushCurrent` 条件を `!currentIsManual && !currentIsGate` に拡張。

**歩いた経路**:

- `runTestCoveragePhase` → `evaluateTestCoverage` → `extractMustTcIds` （verification step 経路）
- `validateStepOutputs` (local.ts:1369) → `evaluateTestCoverage` → `extractMustTcIds` （test-materialize 出力 gate 経路）

**確認した不変条件**:

| 不変条件 | 確認方法 | 判定 |
|---------|---------|------|
| `manual` 除外パスは一切触られない | diff: `categoryManualRe`・`currentIsManual`・`flushCurrent` の manual 条件は変更なし | 保たれる |
| `flushCurrent` は TC section 切替でフラグを全リセットする | diff: `currentIsGate = false` を `flushCurrent` 内に追加 ✓ | 保たれる |
| gate フラグは TC section の外で立たない | コード: `currentTcId &&` 条件が全 branch に存在 | 保たれる |
| enum 行 `**Category**: unit \| integration \| manual \| gate` は誤マッチしない | regex 解析: コロン直後が `unit` → `\s*gate` にも `\s*manual` にも不一致 | 保たれる |
| `evaluateTestCoverage` 内に第二の除外判定点が無い | `extractMustTcIds` の戻り値のみを `mustTcIds` として走査、フィルタ追加なし | 保たれる |
| `assertionlessTcIds` チェックは gate TC を踏まない | gate TC は `mustTcIds` に含まれないため `foundTcIds` ループに入らない | 保たれる |
| `totalMustTcs` は gate TC を数えない | `mustTcIds.length` から算出、gate TC は extract 時点で除外済み | 保たれる |

**具体的な実行列で不変条件が破れるかを試みた**:

- gate TC の ID がテストファイルに書かれている場合: `extractMustTcIds` 返り値に含まれないため `tcIdBoundaryRe` での検索ループに入らない → `foundTcIds` にも `assertionlessTcIds` にも現れない ✓
- gate + manual TC が同じ TC section 内に存在する場合: `else if` 構造で先に manual 分岐が評価される。`flushCurrent` は両フラグを確認して除外する → 二重フラグで誤動作なし ✓
- gate TC の Priority が `should`/`could` の場合: `priorityMustRe` が立たないため `currentIsMust = false` のまま → `flushCurrent` で除外 ✓

### 2. `test-materialize-system.ts` 変更 — 既存 5 節骨格の不変条件

**変更内容**:
- Contract 節 write-set に禁止行を追加
- Method 節 manual block 直後に gate TC 扱い block を追加

**確認した不変条件**:

| 不変条件 | 確認方法 | 判定 |
|---------|---------|------|
| 5 節（Question/Contract/Method/Evidence/Completion）が順序通り存在する | `extractSection` テストが無改変 green ✓、構造を目視確認 | 保たれる |
| Method 節に新規 h2 見出しが追加されない | 追加テキストは bold + bullet 形式、`^## ` で始まる行なし | 保たれる |
| manual TC の扱い block は変更なし | diff: manual block（75-80 行）への編集なし、gate block は直後に追加 | 保たれる |
| トレーサビリティコメント手順 `// TC-` は Method 節内に残る | 既存テスト TC-001 は `// TC-` を Method 節内で確認、変更なし | 保たれる |
| `architecture/` のリポジトリ固有パスが含まれない | grep で確認なし、追加テキストに `architecture/` 参照なし | 保たれる |

**Contract 節 write-set に禁止行を追加した構造上の影響**:

write-set の意味論（「書けるファイルの集合」）に対してコード内容制約の bullet を混入している。これは write-set の既存意味論を広げる構造上の選択であり、機械検証パス（`validateStepOutputs`）はプロンプトの write-set bullet を parse しないため、機械的な不変条件は破られない。意図した配置（要件 5 で Contract に明記と指定）である点を確認。

### 3. `test-case-gen-system.ts` 変更 — Summary 節と既存テストの不変条件

**変更内容**: Category 列挙を `unit | integration | manual | gate` に更新、gate 定義行を追加。

**確認した不変条件**:

| 不変条件 | 確認方法 | 判定 |
|---------|---------|------|
| 既存 TC-CATG-02 (`toContain("unit \| integration \| manual")`) が green | 列挙が `unit \| integration \| manual \| gate` — 部分文字列として残る | 保たれる |
| Summary 節フォーマット（Total/Automated/Manual/Priority）は変更なし | diff: Summary 節への変更なし | 保たれる |
| 5 節骨格が維持される | 追記は `## Method` 節内部、新規 `## ` 追加なし | 保たれる |

### 4. `step-output-templates.ts` 変更 — template の不変条件

**変更内容**: Category 行を `unit | integration | manual | gate` に更新、gate TC の GWT 省略注記を追加。

**確認した不変条件**:

| 不変条件 | 確認方法 | 判定 |
|---------|---------|------|
| TC-NNN format 指示が残る | テスト `toContain("TC-{NNN}")` — 変更なし | 保たれる |
| mixed format 記述が残る | テスト `toContain("mixed format")` — 変更なし | 保たれる |
| GWT 必須フィールド構造（GIVEN/WHEN/THEN）が残る | diff: GWT 節は変更なし | 保たれる |
| Result YAML キー群が残る | 変更なし | 保たれる |
| `prompt-skeleton-drift-guard` TC-012 禁止の `Category determination:` テーブルを追加していない | 追記は散文 bullet のみ | 保たれる |

### 5. `docs/test-coverage.md` 変更 — 既存テストの不変条件

**確認した不変条件**:

| 不変条件 | 確認方法 | 判定 |
|---------|---------|------|
| リテラル走査の記述が残る | 既存テスト確認 — 変更なし | 保たれる |
| トレーサビリティコメント規約が残る | 既存テスト確認 — 変更なし | 保たれる |
| manual 除外規約の記述が残る | 既存テスト確認 — manual 節は変更なし | 保たれる |

---

## 検証できなかった項目

**破壊確認（`!currentIsGate` 条件を一時除去してテストが fail することの確認）**: 実装後の状態でのみ検証可能（コードを破壊するステップは review の範囲外）。tasks.md は verification / code-review の過程でこの確認を要求しているが、verification-result.md にその記録はない。ただし、TC-001〜006 の gate 除外テストは実装前が RED（tasks.md に明記）であることが「歯の実在」の間接証拠となる。

---

## Observations（非ブロッキング）

### O-1: `docs/test-coverage.md` — "gate" の二重意味

`Category: manual` 節（行 62）の「gate の偽装 pass」「レビュー gate の管轄」は pipeline の coverage gate 機構を指す。直下に `## Category: gate の must TC は集計から除外` 節が追加されたことで、同一ドキュメント内で "gate" が「カバレッジ gate 機構」と「TC 分類値」の 2 つの意味を持つ。機械検証パスへの影響はないが、このドキュメントを文脈として読む下流 agent が混乱する可能性がある。

### O-2: `test-materialize-system.ts` — gate TC block 内の "coverage gate の偽装 pass"

新規 gate TC block（Method 節）が「coverage gate の偽装 pass になるため作成しない」と記述している。同一 Method 節内に `Category: gate` TC の扱いが説明されるため、"coverage gate" と "Category: gate" の近接が agent 誘導の文脈で曖昧さを生む。機械検証パスへの影響はない。

### O-3: `categoryGateRe` — 語末境界なし

`/\*\*Category\*\*:\s*gate/` は `gated`・`gateway` にもマッチする。`categoryManualRe` と同一設計で、Category 値は prompt 制御（4 値のみ）のため実害はないが、pre-existing な設計方針の踏襲である。
