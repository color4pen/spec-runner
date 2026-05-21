# Tasks: delta-apply-normalization

## Task 1: `spec-merge.ts` に type 読み込みと分岐ロジックを追加

### 1.1 request.md 読み込み

`mergeSpecsForChange` の冒頭（現在の `specsDir` 計算の前）に以下を追加:

1. `changeFolderPath(slug)` + `/request.md` を `fs.readFile` で読む
2. `parseRequestMdContent(content, filePath)` を呼ぶ（import 追加: `src/parser/request-md.ts`）
3. `request.md` 不在 → `{ ok: false, escalation, exitCode: 1 }` を返す
4. parse error (throw) → catch して同上
5. `parsedRequest.type` を `TYPE_CONFIG` で照合（import 追加: `src/config/type-config.ts`）
6. TYPE_CONFIG に無い値 → fail

### 1.2 type 別 skip/fail 判定

現在の lines 355-357 と 370-372 の `{ ok: true, skipped: true }` を type 別に分岐:

```typescript
const SPEC_REQUIRED_TYPES = new Set(["spec-change", "new-feature"]);
```

- `specs/` 不在 or capability dir 0 件:
  - type が `SPEC_REQUIRED_TYPES` に含まれる → `{ ok: false, escalation: "..." }`
  - それ以外 (bug-fix / refactoring / chore) → `{ ok: true, skipped: true }` (現行通り)

### 1.3 空 delta 検出

capability loop 内の `parseDeltaSpec(deltaContent)` 直後に:

```typescript
if (delta.added.length + delta.modified.length + delta.removed.length === 0) {
  allErrors.push(`[${capability}] Delta spec is empty (no ADDED/MODIFIED/REMOVED requirements)`);
  continue;
}
```

`validateDeltaSpec` の前に配置する（format validation の前に semantic check）。

### 受け入れ基準
- [x] `request.md` 不在で fail
- [x] parse error で fail
- [x] type field 不在で fail (parseRequestMdContent が throw)
- [x] 未知 type で fail
- [x] `spec-change` + specs/ 不在 → fail
- [x] `new-feature` + specs/ 不在 → fail
- [x] `bug-fix` / `refactoring` / `chore` + specs/ 不在 → 正常 skip
- [x] 空 delta で fail
- [x] 既存テスト (TC-SM-070〜082) が green (mock 修正含む)

---

## Task 2: テスト追加 (`tests/finish-spec-merge.test.ts`)

### 2.1 既存テスト修正

TC-SM-070 (`skip when specs/ not found`) は現在 `fs.exists` が全て false を返す。type 読み込みが加わるため:
- `fs.readFile` mock に request.md 相当の content を返す応答を追加（type = `bug-fix` で specs/ 不在は正常 skip を維持）
- TC-SM-071〜082 も同様に `readFile` が `request.md` path で呼ばれたとき有効な content を返すよう修正

### 2.2 新規テストケース

| ID | テスト内容 | 期待 |
|----|-----------|------|
| TC-SM-090 | request.md 不在 (readFile throws) | ok:false, escalation 含む |
| TC-SM-091 | request.md parse error (title 欠落) | ok:false |
| TC-SM-092 | type field 不在 | ok:false |
| TC-SM-093 | 未知 type (`"unknown-type"`) | ok:false, escalation に type 言及 |
| TC-SM-094 | `spec-change` + specs/ 不在 | ok:false, escalation に "spec" 言及 |
| TC-SM-095 | `new-feature` + specs/ 不在 | ok:false |
| TC-SM-096 | `bug-fix` + specs/ 不在 | ok:true, skipped:true |
| TC-SM-097 | `refactoring` + specs/ 不在 | ok:true, skipped:true |
| TC-SM-098 | `chore` + specs/ 不在 | ok:true, skipped:true |
| TC-SM-099 | `spec-change` + specs/ あり + capability dir 0 件 | ok:false |
| TC-SM-100 | capability dir に空 delta (added/modified/removed 全 0) | ok:false |
| TC-SM-101 | cross-capability: cap-a valid + cap-b 空 delta → 全 write 0 | ok:false, writeFile 0 回 |
| TC-SM-102 | `bug-fix` + specs/ あり + 有効 delta → 正常 apply | ok:true, skipped:false |

### 受け入れ基準
- [x] 全新規テストが pass
- [x] 既存テスト (TC-SM-070〜082) が修正後も pass
- [x] `bun run test` green

---

## Task 3: `specrunner/specs/spec-merge/spec.md` 新設

新規 capability `spec-merge` の baseline spec を作成する。

内容:
- Purpose: delta spec を baseline spec に merge する際の不変条件・type 別判定・atomic apply を定義する
- Requirements (ADDED):
  1. delta apply の skip 条件は type に依存する
  2. capability dir 配下の delta が空は fail
  3. cross-capability apply は atomic
  4. type ↔ apply 規則の権威ソースは TYPE_CONFIG
- Scenarios: request に記載の 4 件

ファイルパス: `specrunner/specs/spec-merge/spec.md`

### 受け入れ基準
- [x] ファイルが存在し、4 Requirements + 4 Scenarios を含む
- [x] 各 Requirement に SHALL/MUST キーワードが含まれる

---

## Task 4: `specrunner/specs/cli-finish-command/spec.md` 修正

Phase 0 check 表から:
1. Check 5 (`openspec/changes/<slug>/` 実存 + delta spec 有無判定) を削除
2. Check 6 (`openspec validate <slug>` dry-run) を削除
3. Check 7 の `openspec` を必須バイナリリストから除去 → `gh` `git` のみ
4. check 番号を振り直す (旧7→新5、旧8→新6、旧9→新7)

Scenario から:
1. 「openspec validate fail で escalation」Scenario を削除
2. 「バイナリ不在で escalation」Scenario の `openspec` 言及を除去
3. 「全 check 通過」Scenario の check 番号を修正 (1〜5)

### 受け入れ基準
- [x] Phase 0 check 表が 7 行 (check 1〜7)
- [x] `openspec` がバイナリリストに含まれない
- [x] `openspec validate` Scenario が存在しない
- [x] バイナリ不在 Scenario に `openspec` 言及なし

---

## Task 5: `src/prompts/spec-fixer-system.ts` 更新

「ファイル配置」セクション (lines 46-50) を以下に更新:

```
### ファイル配置

- delta spec は `specs/<capability-name>/spec.md` に配置すること（唯一の正規 path）
- `<capability-name>` は design.md で宣言した名前を使用すること
- 以下の正規外 path への出力は禁止:
  - `<change>/delta-spec.md`（単一フラット形式）
  - `<change>/delta-spec/<capability>.md`（ディレクトリ形式だが非正規）
  - `<change>/specs/<name>.delta.md`（拡張子付きフラット形式）
```

### 受け入れ基準
- [x] `buildSpecFixerSystemPrompt()` の戻り値に `specs/<capability-name>/spec.md` が含まれる
- [x] 正規外 path 3 例が禁止として列挙されている

---

## Task 6: delta spec 作成 (本 change 用)

`specrunner/changes/delta-apply-normalization/specs/` 配下に delta spec を配置する。

### 6.1 `specs/spec-merge/spec.md` (ADDED — Task 3 と同内容)

新規 capability のため、change folder 配下に ADDED Requirements として delta spec を配置し、finish 時に baseline に merge されるようにする。

### 6.2 `specs/cli-finish-command/spec.md` (MODIFIED)

Task 4 の変更を delta spec 形式で記述する。

### 受け入れ基準
- [x] `specrunner/changes/delta-apply-normalization/specs/spec-merge/spec.md` が存在
- [x] `specrunner/changes/delta-apply-normalization/specs/cli-finish-command/spec.md` が存在

---

## Task 7: typecheck + test green 確認

```bash
bun run typecheck && bun run test
```

全 pass を確認。fail があれば修正。

### 受け入れ基準
- [x] `bun run typecheck` exit 0
- [x] `bun run test` exit 0

---

## 実行順序

```
Task 1 → Task 2 → Task 7 (実装 + テスト green 確認)
Task 3 (spec 新設、Task 1 と並行可)
Task 4 (spec 修正、Task 1 と並行可)
Task 5 (prompt 更新、Task 1 と並行可)
Task 6 (delta spec、Task 3, 4 完了後)
```
