# Design: spec-review baseline 取得を Read-tool-pull モデルに切替

## 問題

spec-review の `## Baseline Spec Consistency Check` は **初期メッセージ注入モデル** で実装されている:

1. `SpecReviewStep.enrichContext()` が baseline spec を fs.readFile で読み取り `DynamicContext.baselineSpecs` に格納
2. `buildSpecReviewInitialMessage()` が `{{BASELINE_SPECS}}` placeholder を `<baseline-specs>` XML セクションに展開
3. system prompt が「When baseline specs are provided in the initial message」で条件分岐
4. **caller が populate しなければ無音 skip** (L84: "If no baseline specs are provided, skip this check entirely.")

PR #306 / PR #308 で caller が populate せず check が無音 skip され、spec-merge escalation が連続発生した。

## 設計方針: Read-tool-pull モデル

openspec-workflow の spec-reviewer.md §2.1 と同じ方式:

- agent 自身が `Read` tool で `specrunner/specs/<capability>/spec.md` を読み取る
- prompt にステップバイステップの手順を明示
- caller の入力組み立てに依存しない = **必ず check が実行される**

## 変更概要

### 1. system prompt 書き換え (`src/prompts/spec-review-system.ts`)

`## Baseline Spec Consistency Check` セクション (L74-84) を Read-tool-pull 手順に書き換え:

```
When the delta spec contains `## MODIFIED` / `## REMOVED` / `## RENAMED` / `## ADDED`
Requirements sections, follow these steps:

1. Identify the capability name from the delta spec path
   (`specrunner/changes/<slug>/specs/<capability>/spec.md`)
2. Read `specrunner/specs/<capability>/spec.md` using the Read tool
3. Extract existing `### Requirement:` headers from the baseline
4. For MODIFIED / REMOVED / RENAMED-FROM headers: verify each exists in baseline
5. For ADDED headers: verify each does NOT already exist in baseline
6. For each mismatch, report a HIGH severity finding (category: consistency)
7. If the baseline file does not exist and the delta has MODIFIED/REMOVED sections,
   report a HIGH severity finding (category: consistency)
```

"If no baseline specs are provided, skip this check entirely." を削除。

### 2. 初期メッセージテンプレートから注入経路を削除 (`src/prompts/spec-review-system.ts`)

- `{{BASELINE_SPECS}}` placeholder を template から削除
- `baselineSpecs?: Record<string, string>` を `SpecReviewPromptInput` から削除
- `buildSpecReviewInitialMessage()` 内の baseline specs section 構築ロジック (L197-203) を削除
- `.replace(/{{BASELINE_SPECS}}/g, baselineSpecsSection)` (L213) を削除

### 3. DynamicContext から baselineSpecs field を削除 (`src/git/dynamic-context.ts`)

L42-48 の `baselineSpecs?: Record<string, string>` field と JSDoc を削除。
`collectDynamicContext()` は元々この field を設定していないため変更なし。

### 4. SpecReviewStep.enrichContext() を簡素化 (`src/core/step/spec-review.ts`)

L89-110 の `enrichContext()` から baselineSpecs を構築するロジックを削除。
Read-tool-pull モデルでは agent が自力で baseline を読むため、enrichContext の baseline 収集は不要。

enrichContext 自体は他の用途で将来使う可能性があるため、メソッドは残し body を単純化する:
- specs/ ディレクトリの走査と fs.readFile は削除
- `dynamicContext` をそのまま返す

### 5. buildMessage() から baselineSpecs 受け渡しを削除 (`src/core/step/spec-review.ts`)

L124 の `baselineSpecs: deps.dynamicContext?.baselineSpecs` を削除。

### 6. Read tool 権限の確認

spec-review agent は `agent_toolset_20260401` (= 標準ツールセット) を使用しており、Read tool は標準ツールセットに含まれる。追加の権限設定は不要。

## 影響範囲

| ファイル | 変更内容 |
|---------|----------|
| `src/prompts/spec-review-system.ts` | system prompt 書き換え + template/input/builder 削除 |
| `src/core/step/spec-review.ts` | enrichContext 簡素化 + buildMessage から baselineSpecs 削除 |
| `src/git/dynamic-context.ts` | baselineSpecs field 削除 |
| `tests/prompts/spec-review-system.test.ts` | 注入モデル系テスト削除 + Pull モデルテスト追加 |

## リスク

- **agent が Read を忘れる / 怠る**: prompt に MUST で明示 + step-by-step 手順で軽減。設計元 (openspec-workflow) で実績あり
- **baseline spec が大きすぎて context を圧迫**: 既存注入モデルでも同じサイズを initial message に入れていたため、悪化はしない。むしろ agent が必要な capability のみ Read するため改善する可能性がある

## スコープ外

- `design-system.ts` 側の baseline 確認手順強化
- `spec-merge` への machine check 移植 (#313 Sub-2)
- spec-review prompt のその他改修
