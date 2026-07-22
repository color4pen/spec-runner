# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 1. spec ファイル構成の確認

- `request.md` / `design.md` / `spec.md` / `tasks.md` を全文 Read 済み
- 既存コード `src/core/verification/changed-line-coverage.ts`（全 319 行）、`changed-lines.ts`（全 178 行）を Read 済み
- 既存テスト `tests/unit/core/verification/changed-line-coverage.test.ts`（全 536 行）を Read 済み
- `runner-coverage-gate.test.ts`（冒頭 50 行）で runner の mock 方針を確認
- `request-review-result-001.md` / `request-review-attestation.json` で前 step の findings を確認

### 2. コードアサーション再検証

request.md・design.md が参照するコードのライン番号を実ファイルで照合した。

| アサーション | 確認結果 |
|---|---|
| `changed-line-coverage.ts:97-101` — `if (!lcov.has(file))` → fail | ✓ |
| `changed-line-coverage.ts:113-116` — DA 無し行 pass（TC-CLG-03 受け皿） | ✓ |
| `changed-line-coverage.ts:148-149` — `not loaded by test suite` 文言 | ✓ |
| `changed-line-coverage.ts:85-95` — include/exclude glob のみ（内容判定なし） | ✓ |
| `EvaluateResult` の `skippedFiles: string[]`（TC-CLG-05/06 が `toContain` で固定） | ✓ |
| `runner.ts:398,599` — `runChangedLineCoverageGate` 呼び出し箇所 | ✓ |
| `runner-coverage-gate.test.ts` — `runChangedLineCoverageGate` を `vi.mock` で丸ごと差し替え | ✓（l.31-37） |
| 既存テスト実数: `grep -c "^\s*it(" changed-line-coverage.test.ts` → 16 件（request 記載 "26件" は誤り） | ✓（再測） |

### 3. 設計健全性の検証

#### 3a. isTypeOnlySource の安全不変条件（偽陽性ゼロの保証）

Design D2 の消費ロジック：許可リーダで開始した文を consume-to-end し、depth 0 での文境界（`;` / 閉括弧による depth→0 / 改行）で終端、直後が型継続トークン（`| & ? : . , < > ( [ ) ] => extends keyof typeof infer readonly in as is asserts`）でなければ次の文のリーダとして再分類する。

検証ケース（実 TypeScript で追跡）：

| 入力 | 期待 | 追跡結果 |
|---|---|---|
| `type X = A \| B`（単行） | true | `type` leader → consume → EOL → EOF → true ✓ |
| `type E =\n  \| "a"\n  \| "b"` | true | EOL after `=`: prev=`=`（演算子）→ 非終端。EOL after `"a"`: next=`\|`（継続）→ 非終端。EOF → true ✓ |
| `type X = A\nfoo()` | false | EOL after `A`: next=`foo`（非継続）→ 終端。`foo` は非許可リーダ → false ✓ |
| `interface Foo { bar: string; }` | true | `{` → depth=1。`}` → depth=0 boundary。next=EOF → true ✓ |
| `interface Foo { }\nfoo()` | false | depth→0 boundary after `}`。next=`foo`（非継続）→ 終端。`foo` 非許可 → false ✓ |
| `declare module "lib" { export function f(): void; }` | true | `declare` leader → depth 1 内の `function` は depth>0 で boundary 対象外 → depth→0 boundary → EOF → true ✓ |
| `export {}` | true | `export` → next=`{` → next-next=`}` → 空 → 許可 → true ✓ |
| `export * from "./a"` | false | `export` → next=`*`（許可外）→ false ✓ |
| `export type * from "./a"` | true | `export` → `type` → 許可パス → `*`, `from`, string を consume → EOF → true ✓ |

#### 3b. `export type { A } from "./a"` の偽陰性確認

`export type { A } from "./a"` のトークン列: `export`, `type`, `{`, `A`, `}`, `from`, `"./a"`

- `export` → `type` → 許可パス
- `{` → depth=1。`}` → depth=0 → boundary 発生
- 次トークン `from` → 型継続トークンに含まれない → 文終端
- `from` が新たなリーダとして分類 → 許可リーダ外 → **false（偽陰性）**

`from` を継続トークンに追加すると `from.x = 1` のような runtime 式文を吸収して偽陽性になるため、追加は正しくない。この偽陰性は設計上意図的（偽陰性許容方針）。しかし `tasks.md` T-04 の受け入れ基準に「`export type`（re-export）→ true」と明記されており、実装者が `export type { A } from "./a"` を真に期待してテストを書いた場合、テストが失敗する。

→ **Findings F-01** として記録（下記参照）。

#### 3c. D3 データ注入パターンの後方互換性

`EvaluateInput.typeOnlyFiles?: Set<string>`（optional）の追加は additive change。既存テスト（TC-CLG-01〜09, GATE-01〜06）は評価器を `typeOnlyFiles` 省略で呼び出しており、従来挙動（lcov 不在 → fail）が完全に保持される。 ✓

#### 3d. `EvaluateResult` 型拡張

`typeOnlySkipped: TypeOnlySkip[]` の追加は新フィールド追加であり、既存の `skippedFiles: string[]` を変更しない。TC-CLG-05/06 の `skippedFiles.toContain(...)` アサーションへの影響なし。 ✓

#### 3e. orchestrator の fail-closed パス

読取り失敗 → `typeOnlyFiles` に追加しない → 評価器で従来の `not-loaded` fail。設計 D4 の記述どおり。 ✓

### 4. テスト計画の網羅性

spec.md の全 Scenario と T-04 タスクのマッピング：

| Spec Scenario | T-04 カバレッジ |
|---|---|
| 型のみ構文 → true | type-only.test.ts: true ケース群 |
| runtime 構文混在 → false | type-only.test.ts: false ケース群 |
| 型宣言 + 式文混在（ASI） → false | type-only.test.ts: 混在ケース |
| lcov 不在 type-only → skip 記録 | changed-line-coverage-type-only.test.ts |
| lcov 不在 runtime → fail | changed-line-coverage-type-only.test.ts |
| ソース読取り失敗 → fail | changed-line-coverage-type-only.test.ts |
| DA 無し行 pass（TC-CLG-03） | 既存テスト（変更なし） |
| exclude → skippedFiles（TC-CLG-05/06） | 既存テスト（変更なし） |

全 Scenario がカバーされている。 ✓

### 5. セキュリティ検証

- **入力範囲**: 読取り対象は `git diff --name-only` が列挙した worktree 内の追跡済みファイルのみ。`path.resolve(cwd, file)` は cwd-relative POSIX パスを解決するが、git は `../` を含むパスをトラック対象としないため、path traversal は実質不可能。
- **偽陽性ゼロ不変条件**: 正しい TypeScript（typecheck passed 前提）の runtime 文は許可リーダ集合外のトークンで始まり、consume の早期終端バイアスで runtime 文が型文に吸収されない。gate bypass（偽陽性）は構造的に排除されている。
- **依存追加なし**: 新規外部依存ゼロ。`isTypeOnlySource` は純粋な字句処理で外部 I/O なし。
- **ReDoS**: 実装が文字単位の走査であれば ReDoS 不可能。regex ベースでも単純パターンの想定。
- **OWASP A01–A10**: 本変更に適用可能な項目なし（内部 CI/CD ツール、インジェクション不可、crypto なし、新依存なし）。

## 検証できなかった項目

None。全アサーションを実コードで確認済み。

## Findings 詳細

### F-01: tasks.md の「export type（re-export）→ true」記述が `export type { A } from "./a"` を誤って期待させる

**分類**: low / fixable

**場所**: `specrunner/changes/coverage-type-only-not-loaded/tasks.md`、T-04 acceptance criteria

**内容**:

tasks.md T-04 の受け入れ基準に:
> true: ... `export type`（re-export）...

と記載されている。実装者がこれを `export type { A } from "./a"` 形式として解釈しテストを書いた場合、consume-to-end ロジックでは `}` 後の `from` が型継続トークンに含まれないため偽陰性となり、テストが失敗する（意図と実装が乖離）。

`from` を型継続トークンに追加すると `from.x = 1` のような runtime 式文を `type X = {...} from ...` の継続として吸収し偽陽性を生じるため、追加は不可。

**設計との整合**: design.md D1 の例示は `export type { A }`（from なし）と `export type * from ...`（star 形式）のみ。"re-export 含む" は star re-export を指す。`export type { A } from "./a"` は "偽陰性許容" カテゴリの既知制限。

**修正案**: tasks.md T-04 の受け入れ基準の `export type`（re-export）の例を `export type * from "./a"` に限定するか、`export type { A } from "./a"` は偽陰性として脚注で明記する。
