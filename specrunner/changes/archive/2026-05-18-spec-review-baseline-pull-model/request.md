# spec-review の baseline 取得を Read-tool-pull モデルに切替えて入力経路の断線を解消する

## Meta

- **type**: spec-change
- **slug**: spec-review-baseline-pull-model
- **base-branch**: main
- **adr**: true
- **date**: 2026-05-19
- **author**: color4pen
- **issue**: #313

## 背景

PR #306 / PR #308 finish で同型の spec-merge escalation が連続発生 (= delta spec の `## MODIFIED Requirements` 配下 Requirement header が baseline に存在しない事故)。

`src/prompts/spec-review-system.ts` には既に「`## Baseline Spec Consistency Check`」セクション (L74-84) があり、MODIFIED requirements の HIGH severity check (= `category: consistency`) は書かれている。しかし末尾の以下の行で **caller が baseline specs を提供しないと無音 skip** される:

```
If no baseline specs are provided in the initial message, skip this check entirely.
```

= **初期メッセージ注入モデル** (`{{BASELINE_SPECS}}` placeholder + `baselineSpecs?: Record<string, string>` opt-in) で、caller (= `core/spec-review-session` 等) が populate しないと check が機能しない。これが PR #306 / PR #308 の真因。

### 設計元 (= openspec-workflow) の方式

`~/Documents/GitHub/openspec-workflow/agents/spec-reviewer.md` §2.1 は **Read-tool-pull モデル**:

- agent 自身に `Read` tool 権限を渡す
- prompt に「`openspec/specs/<spec>/spec.md` を Read して比較」と手順を明示
- caller の入力組み立てに依存しない (= 必ず check が機能する)

## 設計判断

### 1. `{{BASELINE_SPECS}}` 注入経路を廃止

`spec-review-system.ts` から:

- `{{BASELINE_SPECS}}` placeholder (= prompt 文字列内)
- `baselineSpecs?: Record<string, string>` input field
- 「If no baseline specs are provided ... skip this check entirely」conditional skip 文

を削除。

### 2. Read-tool-pull モデルへの切替

`## Baseline Spec Consistency Check` セクションを以下の手順で構成:

```
When the delta spec contains `## MODIFIED` / `## REMOVED` / `## RENAMED` 
Requirements sections, follow these steps:

1. Identify the capability name from the delta spec path 
   (`specrunner/changes/<slug>/specs/<capability>/spec.md`)
2. Read `specrunner/specs/<capability>/spec.md` using the Read tool
3. Extract existing `### Requirement:` headers from the baseline
4. Compare with the MODIFIED / REMOVED / RENAMED-FROM headers in the delta spec
5. For each mismatch, report a HIGH severity finding (category: consistency)
6. If the baseline file does not exist and the delta has MODIFIED/REMOVED sections, 
   report a HIGH severity finding (category: consistency)
```

= caller 依存ゼロ、agent が必ず check を実行する。

### 3. caller (= spec-review session の orchestrator) 側改修

`baselineSpecs` を渡している経路を削除:

- spec-review session builder (= 推定 `src/core/spec-review/...` or `src/agents/spec-review-runner.ts` 等、実装時に確認)
- prompt template に渡す変数から `baselineSpecs` 削除

agent の `Read` tool 権限は確定済 (= `SpecReviewStep.enrichContext()` で既に file 読み取りが動作している事実から、agent には Read tool 権限が付与されている)。

### 4. 既存 ADDED / REMOVED check の維持

L82 の ADDED check (= 「ADDED requirements MUST NOT already exist in baseline」) も Read-tool-pull で行う:

- agent が baseline を Read した時に、ADDED header が既存と被っていないかも同時 check

= Pull モデルなら全方向 (= MODIFIED / REMOVED / ADDED / RENAMED) で baseline 確認が一貫する。

## 要件

### 1. `spec-review-system.ts` の Read-tool-pull モデル化

`src/prompts/spec-review-system.ts`:

- `{{BASELINE_SPECS}}` placeholder を削除
- `baselineSpecs?: Record<string, string>` input field の型定義を削除
- 「`## Baseline Spec Consistency Check`」セクションを Read-tool-pull モデル (= 設計判断 2) に書き換え
- 「If no baseline specs are provided ... skip this check entirely」conditional skip 文を削除

### 2. spec-review session orchestrator 側の対応

以下 file から `baselineSpecs` 関連を削除する (= grep で確認済の使用箇所 4 ヶ所):

- `src/git/dynamic-context.ts:48`: `DynamicContext.baselineSpecs?: Record<string, string>` field を削除
- `src/core/step/spec-review.ts:96-105`: `SpecReviewStep.enrichContext()` 内で各 capability の baseline を読んで `baselineSpecs` に格納している logic を削除 (= Read-tool-pull に切替後は不要)
- `src/core/step/spec-review.ts:124`: prompt builder に `baselineSpecs` を渡している箇所を削除
- `src/prompts/spec-review-system.ts:198-203`: prompt 内で `baselineSpecs` を展開して `<baseline-specs>` セクションを構築している logic を削除 (= 要件 1 で input field 削除と整合)

### 3. 既存 test の維持

`tests/unit/prompts/spec-review-system.test.ts` (= 存在する場合) + spec-review session 関連 test:

- `baselineSpecs` 依存 test が存在すれば削除 / 書き換え
- 新 Read-tool-pull モデルでは prompt 文字列に「Read tool で baseline を取得」「4 step 手順」「`category: consistency`」が含まれることを assert

### 4. spec authority への反映

⚠️ 教訓 (= PR #306 / PR #308): delta spec target capability の baseline (`specrunner/specs/spec-review-session/spec.md`) を実装時に MUST Read で確認し、対応する Requirement が存在する場合は MODIFIED、存在しない場合は ADDED を選択する。

delta spec target candidates:

- `specrunner/changes/<slug>/specs/spec-review-session/spec.md` を作成
- delta spec は **ADDED + REMOVED の combo** で構成する:
  - **REMOVED**: 既存 baseline (`specrunner/specs/spec-review-session/spec.md`) の「spec-review の初期メッセージに関連 baseline spec が注入される」Requirement (= 注入モデルの宣言、L121-142 付近) を削除
  - **ADDED**: 新規 Requirement「spec-review agent が Read tool で baseline spec を取得する」を追加 (= Pull モデルの宣言)
- baseline の実際の Requirement header 名称は実装時に MUST Read で確認し、REMOVED セクションに完全一致 header を記載する

Requirement 内容:

- spec-review session は baseline spec を agent 経由 (= `Read` tool) で取得し、initial message での注入は行わない MUST
- agent は delta spec が `## MODIFIED` / `## REMOVED` / `## RENAMED` セクションを含む場合 SHALL baseline spec を Read して header 一致を check する
- agent は delta spec の `## ADDED Requirements` 配下 header が baseline に既存しないかも SHALL Read で check する (= 重複追加の防止、`category: consistency` HIGH severity)
- baseline と一致しない MODIFIED/REMOVED/RENAMED-FROM header は HIGH severity finding (= `category: consistency`) として記録する
- baseline に既存と重複する ADDED header は HIGH severity finding (= 同上) として記録する

## スコープ外

- `design-system.ts` 側の baseline 確認手順強化 (= 別 issue で対応)
- `spec-merge` への machine check 移植 (= #313 Sub-2 で別途対応)
- spec-review prompt のその他改修 (= 本 request は baseline 取得経路のみ)
- 過去事故の遡及 lockdown test

## 受け入れ基準

- [ ] `src/prompts/spec-review-system.ts` から `{{BASELINE_SPECS}}` placeholder が削除されている
- [ ] `baselineSpecs?: Record<string, string>` input field が削除されている
- [ ] 「If no baseline specs are provided ... skip this check entirely」conditional skip 文が削除されている
- [ ] `## Baseline Spec Consistency Check` セクションが Read-tool-pull モデル (= 4 step 手順) に書き換えられている
- [ ] `src/git/dynamic-context.ts:48` の `DynamicContext.baselineSpecs?` field が削除されている
- [ ] `src/core/step/spec-review.ts` の `enrichContext()` で `baselineSpecs` を populate する logic が削除されている
- [ ] `src/core/step/spec-review.ts:124` で `baselineSpecs` を prompt builder に渡している箇所が削除されている
- [ ] `src/prompts/spec-review-system.ts:198-203` の `baselineSpecs` 展開 logic が削除されている
- [ ] 既存 test (= 該当があれば) の regression なし、または Read-tool-pull モデル対応に書き換え
- [ ] `bun run typecheck && bun run test` が green
- [ ] delta spec が `specrunner/changes/<slug>/specs/spec-review-session/spec.md` 配下に baseline 確認の上で **ADDED + REMOVED の combo** で作成されている (= 既存 baseline 注入モデル Requirement を REMOVED、新規 Pull モデル Requirement を ADDED)

## Workflow Options

- enabled: []
