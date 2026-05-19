# Tasks: prevent-authority-path-in-request-body

## [x] Task 1: request-generate prompt に authority path 禁止の MUST ルールを追加

**File**: `src/prompts/request-generate-system.ts`

**What**:
`## Output Rules` セクションの末尾に以下の趣旨のルールを追加する:

```
- request body 内で authority path（`specrunner/specs/<capability>/spec.md`）を MODIFIED / ADDED の対象として直接記述してはならない（MUST NOT）。spec 変更は必ず delta spec path（`specrunner/changes/<slug>/specs/<capability>/spec.md`）で表現すること
```

**Why**: request-generate agent が authority path を request body に書き込む事故を prompt レベルで防止する。

**Constraints**:
- 既存の Output Rules の bullet リストに追加する形式（セクション構造を壊さない）
- `MUST NOT` を明示する

---

## [x] Task 2: buildScaffoldTemplate に delta spec path guidance を追加

**File**: `src/core/command/request.ts`

**What**:
`buildScaffoldTemplate` 関数の出力テンプレートに、spec 変更時の path 規約を示す guidance コメントを追加する。

追加位置: `## 要件` セクションの直前または直後に HTML コメントとして挿入する（既存の `<!-- adr 判断基準: ... -->` と同じパターン）。

内容の趣旨:
```
<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->
```

**Constraints**:
- authority path を例文として書かない
- 既存のコメントパターン（`<!-- ... -->`）を踏襲
- テンプレートの構造（セクション順序）を変えない

---

## [x] Task 3: request-review prompt に authority path 共起検出ルールを追加

**File**: `src/prompts/request-review-system.ts`

**What**:
`### Step 2: Request Validation` セクション内に、新しい検証項目として authority path 共起検出ルールを追加する。

追加する検証項目の趣旨:
- request body 内で authority path（`specrunner/specs/` 配下のパス）と編集動詞（「MODIFIED」「ADDED」「を更新」「を作成」等）が共起している場合、HIGH severity finding として検出する
- 例外: 説明文脈での言及（「authority path であり編集禁止」のような policy 記述、過去事例への言及）は HIGH finding にしない

また、`## Severity Scope Constraint` セクションの HIGH 定義に、authority path 直接指定を HIGH 該当として明示する。

**Constraints**:
- 既存の Step 2 の bullet リストに追加する形式
- referential 除外節を必ず含める（policy 言及や過去事例言及を誤検出しない）
- 検出ルール本体と除外節のテキストは、Task 4 の string assertion で検証可能な形で書く

---

## [x] Task 4: prompt 文字列 contains assertion テストを追加

**File**: `tests/unit/command/request-review.test.ts`

**What**:
`REQUEST_REVIEW_SYSTEM_PROMPT` に対する string assertion テストを 2 件追加する。

テスト 1: 検出ルール本体の存在確認
- `REQUEST_REVIEW_SYSTEM_PROMPT` が authority path + 編集動詞の共起を HIGH finding として検出する旨のテキストを含むことを `toContain` で assert
- TC-RR-011 として追加

テスト 2: referential 除外節の存在確認
- `REQUEST_REVIEW_SYSTEM_PROMPT` が policy 言及・過去事例言及を HIGH finding から除外する旨のテキストを含むことを `toContain` で assert
- TC-RR-012 として追加

**Constraints**:
- 既存テストファイルの命名規約（`TC-RR-NNN`）を踏襲
- `import` に `REQUEST_REVIEW_SYSTEM_PROMPT` を追加（`src/prompts/request-review-system.ts` から）
- assert する文字列は Task 3 で追加した prompt テキストの中核フレーズ（全文一致ではなく、ルールの本質を示すキーフレーズの contains）

---

## [x] Task 5: typecheck & test green 確認

**Command**: `bun run typecheck && bun run test`

**What**: 全変更後にビルドとテストが通ることを確認する。
