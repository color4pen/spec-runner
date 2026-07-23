# Conformance Result — test-materialize-existing-coverage — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 1. tasks.md 完了確認

すべてのチェックボックスが `[x]` でマーク済み。

| Task | 内容 | 状態 |
|------|------|------|
| T-01 | test-materialize system prompt に既存テスト充足の正規手順を追記 | [x] 全チェック完了 |
| T-02 | docs/test-coverage.md 新規作成 + docs/README.md 更新 | [x] 全チェック完了 |

### 2. 設計判断（D1〜D5）への適合

**D1: トレーサビリティコメントを正規手順として prompt に明記**

`src/prompts/test-materialize-system.ts` の `## Method` 節内に Step 3 として追記済み。
`// TC-001: <TC 名>` 形式を明示。「重複作成してはならない」「充足不能として停止しない」を明記。適合 ✅

**D2: test-coverage.ts 無変更、回帰テストで現行挙動を固定**

`git diff main...HEAD -- src/core/verification/test-coverage.ts` → 差分なし。
新規テストファイル `tests/unit/core/verification/test-coverage-comment-form.test.ts` を追加（既存 test-coverage.test.ts は無変更）。適合 ✅

**D3: `## Method` 節内への追記、新規 h2 禁止、`architecture/` 参照禁止**

追記は `## Method` 節の Step 3 として挿入（新規 h2 見出しなし）。
`TEST_MATERIALIZE_SYSTEM_PROMPT` に `architecture/` の出現なし。適合 ✅

**D4: 規約 doc を新規 focused doc に配置**

`docs/test-coverage.md`（新規）を作成: TC-ID リテラル走査 + トレーサビリティ規約を記述。
`docs/README.md` の「docs/ ファイル一覧」表に `test-coverage.md` 行を追加済み。適合 ✅

**D5: 既存テスト充足でも test-cases.md の扱いは同一**

prompt 内「test-cases.md は変更禁止（新フィールドを足さない）」を明記維持。適合 ✅

### 3. Spec 要件・Scenario 充足

**Requirement: test-materialize prompt は既存テスト充足時のトレーサビリティコメント手順を規定する**

| Scenario | テスト | 結果 |
|----------|--------|------|
| prompt が既存テスト充足の正規手順を含む | TC-001: `test-materialize-prompt-contract.test.ts` | ✅ |
| prompt がリポジトリ固有のテストパスを名指ししない | TC-002: 同ファイル | ✅ |
| prompt の 5 節骨格が維持される | TC-003: 同ファイル | ✅ |

証拠（Method 節 extractSection で確認）:
- `// TC-` リテラルを含む ✅
- `既存テスト` を含む ✅
- `重複` を含む（重複作成禁止） ✅
- `停止しない` を含む（停止禁止） ✅
- `architecture/` を含まない ✅
- Question/Contract/Method/Evidence/Completion の 5 節がこの順序で存在 ✅
- Method 節内に新規 h2 見出しなし ✅

**Requirement: test-coverage はコメント形式のみで出現する TC-ID を充足として扱う**

| Scenario | テスト | 結果 |
|----------|--------|------|
| コメント形式のみ + assertion あり → passed | TC-004: `test-coverage-comment-form.test.ts` | ✅ |
| コメント形式のみ + assertion なし → failed (assertionless) | TC-005: 同ファイル | ✅ |

追加 fixtures（境界テスト）:
- コロンなし形式（`// TC-088 traceability`）でも found → ✅
- 複数 must TC がコメント形式でも全 assertion 有り → passed → ✅
- assertion なしファイルと assertion ありファイルが共存 → assertion 有り側が勝つ → ✅

**Requirement: docs に走査規約とトレーサビリティ規約を明文化する**

| Scenario | テスト | 結果 |
|----------|--------|------|
| docs が走査規約とトレーサビリティ規約を含む | TC-006: `test-coverage-docs-contract.test.ts` | ✅ |
| docs/README.md にエントリ | TC-007: 同ファイル | ✅ |

証拠:
- `docs/test-coverage.md` が存在する ✅
- リテラル走査の記述がある（「走査」「リテラル」） ✅
- `// TC-0XX` トレーサビリティコメントが既存カバレッジの表明手段である旨の記述がある ✅
- assertion なしファイルへの追記は assertionless 判定になる旨の警告がある ✅
- `docs/README.md` に `test-coverage.md` のエントリが存在する ✅

### 4. request.md 受け入れ基準

| 基準 | 証拠 | 結果 |
|------|------|------|
| prompt contract テストで固定する | `tests/unit/prompts/test-materialize-prompt-contract.test.ts` 追加・green | ✅ |
| fixture で test-coverage が passed になることをテストで固定する | `tests/unit/core/verification/test-coverage-comment-form.test.ts` 追加・green | ✅ |
| docs に規約が明文化される | `docs/test-coverage.md` 新規作成・内容確認済み | ✅ |
| test-coverage.ts の既存テストが無変更で green | 差分なし・verification passed | ✅ |
| `typecheck && test` が green | verification-result.md: build/typecheck/test/lint/changed-line-coverage 全 passed | ✅ |

### 5. スコープ外の項目（変更されていないことを確認）

- `src/core/verification/test-coverage.ts`: 差分なし ✅
- `tests/unit/core/verification/test-coverage.test.ts`: 差分なし ✅
- test-cases.md への `covered-by` 等の新フィールド: 追加なし ✅
- `docs/guarantees.md` の版号・保証番号: 変更なし（git diff に現れない） ✅

## 検証できなかった項目

None

## Findings 詳細

None — すべての判定項目が適合。
