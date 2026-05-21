# delta-spec-validator (dsv) に rules.md 規定の tool 必須 format rule を追加する

## Meta

- **type**: spec-change
- **slug**: dsv-format-rules-expansion
- **base-branch**: main
- **adr**: false

<!-- adr=false: 既存 plugin registry pattern への rule 追加が中心、構造改修は DeltaSpecRuleInput 拡張のみ -->

## 背景

PR #359 (job-cancel-command) の事後監査で、design agent が `## Removed` セクションを rules.md L141 規定の `- "name"` リスト形式ではなく `### Removed: <name>` heading 形式で書いた違反が発見された。

session resume で design agent に直接ヒアリングしたところ「rules.md を読まずに既存パターンからの推測で書いた」と自認。**prompt-side アプローチ (= 直注入 / Read / emphasis) は確率的で agent compliance に依存し、stable しない**ことが観測された (memory `feedback_llm_uncertainty_principle`)。

過去 PR の delta spec 改修事例:
- 直注入経路: stable しなかった (= ユーザー履歴)
- Read 経路 (PR #345): skip された (= 今回観測)
- emphasis (`**bold**`): 100% は保証されない (= LLM の確率特性)

= **prompt 経路の強化では format 違反は防げない**。adapter-neutral な保証は **出力後の機械的検証 (= dsv)** でしか達成できない (vendor lock-in 回避方針との整合性: codex / claude / managed-agent いずれの adapter でも dsv は同じ強度で機能する)。

現状 dsv (`src/core/spec/rules/`) は 4 rule (canonical-spec-structure / no-legacy-flat-dir / no-legacy-flat-file / no-specs-for-required-type) しかなく、**rules.md が規定する tool 必須形式の大半が rule 化されていない**。今回の `## Removed` 形式違反も rule 不在で素通りした。

## 要件

### 1. `removed-section-format` rule を追加する

`src/core/spec/rules/removed-section-format.ts` (新規) に、`## Removed` セクション配下の各行が `- "requirement name"` 形式 (= regex `^-\s+"(.+?)"\s*$`) であることを SHALL 検証する rule を追加する。

違反例:
- `### Removed: name` (= heading 形式、PR #359 で発生)
- `- name without quotes`
- 自由形式の説明文

検出時 severity = `error`、suggested fix = `Replace with - "<requirement-name>" format per rules.md`。

### 2. `renamed-section-format` rule を追加する

`src/core/spec/rules/renamed-section-format.ts` (新規) に、`## Renamed` セクション配下の各行が `- "old name" → "new name"` 形式 (= regex `^-\s+"(.+?)"\s*(?:→|->|=>)\s*"(.+?)"\s*$`) であることを SHALL 検証する rule を追加する。

検出時 severity = `error`、suggested fix = `Replace with - "old" → "new" format per rules.md`。

### 3. `requirement-header-required` rule を追加する

`src/core/spec/rules/requirement-header-required.ts` (新規) に、`## Requirements` セクション配下の各 Requirement block が `### Requirement:` で始まる header を持つことを SHALL 検証する rule を追加する。

違反例:
- `### REQ-001: ...` (= 独自フォーマット、PR #303 で過去発生)
- `### <other prefix>: ...`

検出時 severity = `error`。

### 4. `scenario-required-per-requirement` rule を追加する

`src/core/spec/rules/scenario-required-per-requirement.ts` (新規) に、各 Requirement block が少なくとも 1 つの `#### Scenario:` block を含むことを SHALL 検証する rule を追加する。

検出時 severity = `error`、suggested fix = `Add at least one #### Scenario: block describing observable behavior`。

### 5. `normative-keyword-required` rule を追加する

`src/core/spec/rules/normative-keyword-required.ts` (新規) に、各 Requirement の本文 (= header 直後〜最初の Scenario の間) に英語の `SHALL` または `MUST` が少なくとも 1 回出現することを SHALL 検証する rule を追加する。

検出時 severity = `error`、suggested fix = `Add SHALL or MUST in Requirement body to express normative intent`。

### 6. `baseline-header-match` rule を追加する

`src/core/spec/rules/baseline-header-match.ts` (新規) に、delta spec の各 Requirement header が baseline spec (`specrunner/specs/<capability>/spec.md`) と完全一致するか、baseline に存在しないか (= ADDED) のどちらかであることを SHALL 検証する rule を追加する。

baseline が存在しない (= 新規 capability) 場合は全 Requirement を ADDED 扱いとして PASS。

検出時 severity = `error`、suggested fix = `Match baseline header exactly for MODIFIED, or treat as ADDED if new`。

### 7. `DeltaSpecRuleInput` の拡張

`src/core/spec/rules/types.ts` の `DeltaSpecRuleInput` interface に baseline spec へのアクセスを SHALL 追加する:

```typescript
export interface DeltaSpecRuleInput {
  changePath: string;
  deps: DeltaSpecValidatorFs;
  requestType?: string;
  baselineSpecLoader: (capability: string) => Promise<string | null>; // 新規
}
```

`baselineSpecLoader` の実装は `specrunner/specs/<capability>/spec.md` を Read tool 経由で読み、存在しなければ `null` を返す。

呼び出し側 (= `src/core/spec/delta-spec-validator.ts`) で `baselineSpecLoader` を inject する。

### 8. registry への登録

`src/core/spec/rules/index.ts` の `createDeltaSpecRegistry()` に上記 6 rule を追加登録する MUST。

### 9. `DeltaSpecRuleName` union 型の拡張

`src/core/spec/rules/types.ts` の `DeltaSpecRuleName` union に 6 つの新規 rule 名を追加する MUST。

### 10. spec `delta-spec-rule` の delta 更新

baseline (`specrunner/specs/delta-spec-rule/spec.md`) の Requirement に対し、新規 6 rule を ADDED として加える delta spec を `specrunner/changes/dsv-format-rules-expansion/specs/delta-spec-rule/spec.md` に SHALL 作成する。

### 11. 各 rule の unit test 追加

`tests/unit/core/spec/rules/` 配下に 6 rule 分の unit test を追加する MUST。各 test は:
- 正常パターン (= 違反なし) → 空違反リスト
- 違反パターン (= 1 件以上) → 期待される violation
- edge case (= 空ファイル、無関係セクション、等)

### 12. PR #359 同型 regression test 追加

`tests/unit/core/spec/rules/removed-section-format.test.ts` に、PR #359 で発生した `### Removed: name` heading 形式の入力で `removed-section-format` rule が違反を catch することを assert する test を SHALL 追加する。

## スコープ外

- **vendor preference 系 rule** (= ADR 配置 `specrunner/adr/` 強制、命名規約等) は tool 必須形式ではないため本 request の対象外。別議論
- **構造化出力 abstraction** (= tool_use force 等) は vendor lock-in リスクで採用しない方針 (= 別議論、issue #327 等)
- **spec-runner reviewer** (= LLM ベースの rules.md 遵守 reviewer) は別 issue #360 で扱う
- **過去 archive の遡及検証** (= 既 merge PR の delta spec を全件 validate) は別 task
- **`canonical-spec-structure` rule の拡張** (= 既存 rule の振る舞い変更) は本 request 対象外、既存 rule はそのまま

## 受け入れ基準

- [ ] `src/core/spec/rules/` 配下に 6 つの新 rule ファイルが存在する
- [ ] `createDeltaSpecRegistry()` で 6 rule が登録されている (= 登録数が 3 → 9 になる。`no-specs-for-required-type` は別経路で early-return 運用のため registry には含まれない)
- [ ] `DeltaSpecRuleInput` に `baselineSpecLoader` が追加されている
- [ ] `DeltaSpecRuleName` union に 6 つの新名前が追加されている
- [ ] PR #359 の `### Removed: <name>` heading 形式入力で `removed-section-format` rule が違反を返す regression test が green
- [ ] 各 rule の unit test が `tests/unit/core/spec/rules/` 配下にあり全て green
- [ ] `bun run typecheck && bun run test` が green
- [ ] 既存 PR (= merged delta spec) が新 rule で違反扱いにならないことを最低 3 件 (= 最近の archive folder からサンプリング) で確認

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

TBD (= design step で以下を決定):

1. **`baselineSpecLoader` の DI 形式**: dependency function vs class vs port interface
2. **rule 間の依存関係処理**: 例えば `requirement-header-required` が違反した時 `baseline-header-match` を skip するか、独立に回すか
3. **新規 capability (baseline 不在) の扱い**: `baseline-header-match` rule は ADDED 扱いで PASS させるが、`baselineSpecLoader` が `null` を返した時の挙動を rule 側 / registry 側どちらで判定するか
4. **`canonical-spec-structure` rule との重複回避**: 既存 rule (= 旧 section header 検出) と新 rule (= header format) の責務分離
