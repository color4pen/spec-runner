# resume --from で step 名を直接受け付ける (= ResumeRole 型 signature 拡張)

## Meta

- **type**: spec-change
- **slug**: resume-from-step-name
- **base-branch**: main
- **adr**: false
- **date**: 2026-05-18
- **author**: color4pen
- **issue**: #296

## 背景

現状の `specrunner resume --from <role>` は `critic` / `fixer` / `creator` の 3 legacy alias のみ受け付ける (= `src/core/resume/resolve-step.ts:16` の `ResumeRole = "critic" | "fixer" | "creator"` の string union として narrowing)。

### 問題

- 現状の step 名体系 (`design` / `spec-review` / `spec-fixer` / `test-case-gen` / `implementer` / `verification` / `build-fixer` / `code-review` / `code-fixer` / `pr-create`) と乖離
- 「中断した `code-review` から再開したい」を表現できず、ユーザーが内部 mapping (= `critic` ≒ review、`fixer` ≒ fixer、`creator` ≒ implementer) を推測する必要
- 新しい step (= `test-case-gen` / `delta-spec-validation` 等) は alias が無く resume できない

### 関連コード

- `src/core/resume/resolve-step.ts:13-16` (= `ResumeRole` 型定義)
- `src/core/resume/resolve-step.ts:91-106` (= `resolveResumeStep` の `--from` 経路 narrowing)
- `src/cli/command-registry.ts` (= `--from` の parsing 集約)
- 既存 spec: `specrunner/specs/cli-resume-command/spec.md` (= resume の既定動作と `--from` 拡張時の影響範囲)

### 関連 issue

- #296 (= 本 request の原典)
- #295 (= CLI noun-verb 体系再編、別 request。本 request は内部ロジックのみ修正、CLI 階層は触らない)

## 設計判断

1. **採用案: `ResumeFrom = StepName | LegacyResumeRole` の union 型に拡張**
   - `StepName`: 現状の全 step 名 (= deterministic step を含む `delta-spec-validation` / `delta-spec-fixer` も対象)
   - `LegacyResumeRole`: `critic` / `fixer` / `creator` の 3 alias (= 後方互換維持)
   - step 名直接指定 → そのまま resume 開始点として扱う (mapping なし)
   - legacy alias 指定 → 既存対応表で step 名変換 (= 振る舞い regression なし)

2. **不採用案: legacy alias 完全廃止**
   - 後方互換を壊すリスク、移行コスト発生
   - 同一 signature 内に共存可能なので廃止する利益が小さい

3. **不採用案: 別 flag (`--from-step`) 新設**
   - `--from` が役割と step 名で二重定義になり混乱を招く
   - signature 拡張で十分

4. **error message 設計**:
   - 不正値時に「利用可能 step 名一覧 + legacy alias 一覧」を表示
   - 利用可能 step 名は `STEP_NAMES` から動的に列挙 (= step 追加時の保守漏れ防止)

## 要件

### 1. `ResumeFrom` 型の拡張

`src/core/resume/resolve-step.ts`:

- 新型 `ResumeFrom = StepName | LegacyResumeRole` を定義
- `StepName`: `STEP_NAMES` から導出される union (= deterministic step を含む全 step)
- `LegacyResumeRole`: `"critic" | "fixer" | "creator"`

### 2. 解決ロジックの拡張

`resolveResumeStep` (`resolve-step.ts:91`):

- `from` が step 名の場合: 直接 resume 開始点として返す (= phase mapping なし)
- `from` が legacy alias の場合: 既存の `STEP_MAPPING` 経路で phase + role → step 名へ変換 (= 既存挙動維持)
- `from` がいずれにも該当しない場合: error を throw (= 利用可能値を含めた message)

### 3. CLI 側の受け渡し

`src/cli/command-registry.ts` (= `--from` の parsing 集約):

- legacy 3 値のみ受け付ける narrowing を解除し、step 名 + legacy alias を受け付ける
- error message に利用可能な値を一覧表示
- USAGE 文字列 (= `command-registry.ts:89` 付近、現状 `--from=<role>  Override resume step: critic | fixer | creator`) を `--from=<step-or-alias>  Override resume step: <step-name> | critic | fixer | creator` 形式に更新する。step 名一覧は `STEP_NAMES` から動的に列挙するか、代表的な step 名 + alias を列挙する

### 4. test

`tests/unit/core/resume/resolve-step.test.ts` (= 既存 file に追記):

- TC-RESUME-FROM-01: `--from design` → `design` を返す (= step 名直接)
- TC-RESUME-FROM-02: `--from code-review` → `code-review` を返す
- TC-RESUME-FROM-03: `--from delta-spec-validation` → `delta-spec-validation` を返す (= deterministic step も対応)
- TC-RESUME-FROM-04: `--from critic` (legacy) + `makeResumePoint("spec-review")` (= spec phase context) → `spec-review` を返す。`makeResumePoint("implementer")` (= code phase context) → `code-review` を返す
- TC-RESUME-FROM-05: `--from fixer` (legacy) + `makeResumePoint("spec-review")` → `spec-fixer`。`makeResumePoint("implementer")` → `code-fixer`
- TC-RESUME-FROM-06: `--from creator` (legacy) + `makeResumePoint("spec-review")` → `design`。`makeResumePoint("implementer")` → `implementer`
- TC-RESUME-FROM-07: `--from invalid-name` → error throw、message に利用可能 step 名 + legacy alias 一覧を含む

### 5. spec authority への反映

delta spec として `specrunner/changes/<slug>/specs/cli-resume-command/spec.md` を作成し、`## MODIFIED Requirements` セクションで Requirement を記述する (= finish 時に spec-merge が baseline `specrunner/specs/cli-resume-command/spec.md` を更新する経路)。baseline ファイルは直接編集しない (= `AUTHORITY_SPEC_GUARD_RULE` 準拠):

- Requirement 追加: 「`--from` は step 名 (= `STEP_NAMES` の全 deterministic / agent step) または legacy alias (`critic` / `fixer` / `creator`) を受け付ける」
- Scenario:
  - step 名直接指定 → 該当 step から再開
  - legacy alias 指定 → 対応表で step 名変換後に再開
  - 不正値 → 利用可能値一覧を含む error

## スコープ外

- CLI noun-verb 体系全体の再編 (= 別 request、#295)
- `job resume` 等の noun-verb 化 (= 上記別 request で扱う)
- resume の job state 復元範囲拡張
- pipeline step 構成自体の変更
- legacy alias の廃止 (= 後方互換維持)

## 受け入れ基準

- [ ] `ResumeFrom = StepName | LegacyResumeRole` 型が `resolve-step.ts` で定義されている
- [ ] `resolveResumeStep` が step 名を直接受け付け、mapping なしで返す
- [ ] legacy alias 3 種が既存 mapping 通りに動く (= 後方互換 regression なし)
- [ ] 不正値の error message に利用可能 step 名 + legacy alias 一覧が含まれる
- [ ] `src/cli/command-registry.ts` の `--from` parsing が拡張された signature を受け付ける
- [ ] `src/cli/command-registry.ts` の USAGE 文字列が `--from=<step-or-alias>` 形式に更新されている (= legacy 3 値固定の表記が解消されている)
- [ ] 既存 resume 関連 test が regression していない
- [ ] delta spec `specrunner/changes/<slug>/specs/cli-resume-command/spec.md` が `## MODIFIED Requirements` を持つ形で作成されている (= baseline `specrunner/specs/cli-resume-command/spec.md` 自体は本 PR で編集しない、spec-merge 経由で finish 時に更新される)
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []
