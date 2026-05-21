# ADR ファイル命名から連番を廃止し `YYYY-MM-DD-slug.md` 形式に変更する

## Meta

- **type**: spec-change
- **slug**: adr-numbering-removal
- **base-branch**: main
- **adr**: true
- **date**: 2026-05-19
- **author**: color4pen
- **issue**: #310

## 背景

spec-runner の ADR は `ADR-NNNN-YYYY-MM-DD-slug.md` 形式で「連番 + 日付 + slug」の三重複合命名 (= PR #303 で導入)。並列 finish 時に各 worktree が独立に「既存 ADR を ls → max+1」採番するため、複数 PR が同時進行すると **全部同じ番号** を引き当てる事故が発生する。

### 観測

PR #307 / #308 / #309 を並列 run した結果、3 PR とも `ADR-0001-2026-05-18-<slug>.md` を生成。さらに直近 session で PR #315 / PR #317 が両方 `ADR-0004-2026-05-19-...` で衝突し、現在 main 上に `ADR-0004-2026-05-19-baseline-header-consistency-check.md` と `ADR-0004-2026-05-19-spec-review-baseline-pull-model.md` の 2 件が並んでいる。

= filename suffix は違うため git merge は通るが、ADR 番号体系として **同番号が複数並ぶ** 状態が常態化。

## 設計判断

### 1. 連番廃止の判断根拠

| 観点 | 連番ありメリット | spec-runner での実利 |
|---|---|---|
| 短い ID 参照 (`ADR-0042`) | あり | **なし** (= 現状未使用) |
| supersedes / superseded-by 参照 | ID で書ける | **未使用** (= ADR step に status 遷移なし) |
| 並び順の自明さ | file 名で自明 | date prefix で代替可 |
| index 自動生成 | 連番で目次化 | **スコープ外** (= 採用予定なし) |

= 連番のメリットがほぼ働かない一方、**採番衝突という構造的問題** を抱えている。

### 2. 新形式

ADR ファイル命名を `YYYY-MM-DD-slug.md` に変更:

```
旧: specrunner/adr/ADR-0001-2026-05-18-prompt-fragment-registry.md
新: specrunner/adr/2026-05-18-prompt-fragment-registry.md
```

採番衝突問題が **構造的に消える** (= 並列 finish 何件でも安全)。採番ロジック (= `ls` + max+1) を削除可能。date + slug でユニーク (= 同日同 slug は実質起きない)。

### 3. 採番ロジックの所在

採番ロジックは agent prompt 内 (= `src/prompts/adr-gen-system.ts:46` 「`ADR-{NNNN}-{YYYY-MM-DD}-{slug}.md`」) で agent 自身が `ls specrunner/adr/` + max+1 を実行する仕組み (= step file に採番コードなし)。本 request では prompt 側の命名規則記述と採番手順を書き換える。

### 4. 既存 ADR の rename

現状 `specrunner/adr/` 配下の 5 件 (= ADR-0001 〜 ADR-0004 × 2) を新形式にリネームする MUST。git mv で履歴保持。

```
ADR-0001-2026-05-18-prompt-fragment-registry.md       → 2026-05-18-prompt-fragment-registry.md
ADR-0002-2026-05-18-validation-rule-interface.md      → 2026-05-18-validation-rule-interface.md
ADR-0003-2026-05-18-one-shot-query-wrapper.md         → 2026-05-18-one-shot-query-wrapper.md
ADR-0004-2026-05-19-baseline-header-consistency-check.md → 2026-05-19-baseline-header-consistency-check.md
ADR-0004-2026-05-19-spec-review-baseline-pull-model.md   → 2026-05-19-spec-review-baseline-pull-model.md
```

= 連番衝突 (= 0004 が 2 件) が rename で自然解消する。

### 5. ADR 内部の番号参照

各 ADR 内部の本文に `ADR-NNNN` 形式の自己言及参照があれば削除 (= 内部で自分の番号を書いている場合) する SHOULD。grep ベースで確認。

### 6. 本 request 自身の ADR

本 request も `adr: true` なので ADR を生成するが、新形式 `2026-05-19-adr-numbering-removal.md` で生成される (= 実装後に新ルールで自分自身を生成)。本 request 実装後に発生する初の新形式 ADR。

## 要件

### 1. ADR 命名規則の変更

`src/prompts/adr-gen-system.ts` の ADR 命名規則記述を `specrunner/adr/{YYYY-MM-DD}-{slug}.md` に書き換える MUST。

### 2. 採番ロジックの削除

prompt 内の採番手順 (= 既存 ADR を ls → max+1) を削除し、新規 ADR は `date + slug` のみで一意決定する旨を記述する MUST。

### 3. 既存 ADR のリネーム

`specrunner/adr/` 配下の既存 5 ADR ファイルを新形式にリネームする MUST。git mv で実施。

### 4. ADR 内部参照のクリーンアップ

各 ADR 本文に自己言及の `ADR-NNNN` 表記がある場合は削除する MUST。

**grep スコープ**: `specrunner/adr/` 配下のみが対象。`specrunner/changes/archive/` および `specrunner/requests/merged/` には旧形式の歴史的参照が多数存在するが、これらは過去 archive のため touch しない (= 履歴の正確性保持)。

確認コマンド: `grep -rE 'ADR-[0-9]{4}' specrunner/adr/` で 0 件であること。

### 5. delta spec target

target capability: `adr-generation`

該当 Requirement:

- 「judge=yes produces an ADR file」 (= ADR 命名 path に NNNN 連番が含まれる) → MODIFIED
  - 命名規則: `specrunner/adr/ADR-{NNNN}-{YYYY-MM-DD}-{slug}.md` → `specrunner/adr/{YYYY-MM-DD}-{slug}.md`
  - Numbering 行を削除

delta spec path: `specrunner/changes/adr-numbering-removal/specs/adr-generation/spec.md`

⚠️ 規律: target capability の baseline (`adr-generation`) を実装時に MUST Read で確認し、Requirement header を正確に複写する。MODIFIED 配下の header は baseline の header と完全一致 MUST。

### 6. test

ADR 命名・採番に関する unit test がある場合は新形式に合わせて更新する MUST。current の test 状態は実装時に確認 (= `tests/unit/prompts/` および `tests/unit/core/step/adr-gen.test.ts` 等)。

## スコープ外

- ADR の supersedes / superseded-by 機構の導入 (= 別 issue)
- ADR index の自動生成 (= 別 issue)
- ADR の status 遷移 (= 別 issue)
- 採番衝突を connect 経路で防ぐ機構 (= 本 request で構造的に不要化するため)

## 受け入れ基準

- [ ] `src/prompts/adr-gen-system.ts` の ADR 命名規則が `{YYYY-MM-DD}-{slug}.md` 形式に変更されている
- [ ] 採番手順 (= ls + max+1) が prompt から削除されている
- [ ] `specrunner/adr/` 配下の既存 5 ADR が git mv で新形式にリネームされている
- [ ] ADR 内部の自己言及参照が整理されている (= `grep -rE 'ADR-[0-9]{4}' specrunner/adr/` で 0 件、archive/merged は対象外)
- [ ] `bun run typecheck && bun run test` が green
- [ ] delta spec が baseline 確認の上で MODIFIED で作成されている (= target capability `adr-generation`)
- [ ] 本 request 自身の ADR が新形式 (= `2026-05-19-adr-numbering-removal.md`) で生成される

## Workflow Options

- enabled: []
