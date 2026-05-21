# pipeline に ADR 生成 step を新設し、request.md の `adr` フィールドで分岐させる

## Meta

- **type**: new-feature
- **slug**: adr-generation-step
- **base-branch**: main
- **adr**: true
- **date**: 2026-05-18
- **author**: color4pen
- **issue**: #211

## 背景

OSS 公開に向けて、アーキテクチャ判断の経緯を外部の人が理解できる形で残す必要がある。現状 `docs/adr/` / `specrunner/adr/` どちらの ADR ディレクトリも存在しない。

`specrunner/changes/archive/<slug>/design.md` には判断経緯の一部が残っているが、これは **change 単位の設計** であり、横断的なアーキテクチャ判断 (= 「なぜ Hexagonal-lite か」「なぜ LLM session に state を持たせないか」「なぜ Discriminated Union か」等) は記録されていない。

### 設計元 (= openspec-workflow) の運用

openspec-workflow は **`adr-create` skill** を `request-execute` の Step 7 (= archive / PR 作成直前) から自動呼び出しする設計で、`openspec-workflow/adr/` 配下に Michael Nygard 形式の ADR を蓄積している (= 現時点で 50+ ADR)。本 request は openspec-workflow を参考にしつつ、spec-runner 独自の流儀 (= pipeline step として組み込む / `specrunner/adr/` namespace / `adr` フィールドによる宣言的分岐) で構成する。

### 直前 session での観測

untracked file として `docs/architecture.md` (= 2026-05-17 snapshot、レイヤ図 + 設計思想表) が存在するが、これは「全体マップ」であり ADR の単位 (= 1 判断 / 1 ファイル) と性質が異なる。本 request では `docs/architecture.md` を **削除** し、横断 overview は維持せず ADR の集合に責務を集約する。

### 関連 issue

- #211 (= 本 request の原典)
- #263 (= step 責務境界、別 request。ADR step も新規 step なので #263 の責務境界規範に従う)

## 設計判断

### 1. 保存先: `specrunner/adr/` (= spec-runner namespace 配下)

- spec-runner の他の生成物 (= `specrunner/specs/` / `specrunner/changes/`) と namespace を揃える
- openspec-workflow が `openspec-workflow/adr/` を採用しているのと同じ思想 (= プラグイン / 製品名 namespace への集約)
- issue #211 本文の指定 `docs/adr/` は採用しない (= `docs/` は人間向けドキュメント、ADR は spec-runner 内部の判断記録として `specrunner/` 直下が自然)

### 2. 命名規則: `ADR-{NNNN}-{YYYY-MM-DD}-{slug}.md`

- `NNNN`: 4 桁連番 (= `specrunner/adr/` 配下の既存 ADR 数 + 1)
- `YYYY-MM-DD`: ADR 作成日
- `slug`: request.md の slug を流用 (= 1 request = 最大 1 ADR の想定)
- category 分類 (= openspec-workflow の `app` / `skill`) は採用しない (= spec-runner は単一製品で分類軸が無い)

### 3. 分岐: request.md frontmatter の `adr` フィールド (= 必須)

- 値: `true` / `false` の 2 値のみ
- 必須フィールド (= `base-branch` と同等の validation、欠落時 `REQUEST_MD_INVALID` で reject)
- 発議時点で人間が「この request は ADR を残す可能性があるか」を意思表示する粗いフィルタ

### 4. 2 段階フィルタ設計

| 段階 | 主体 | 役割 |
|---|---|---|
| 段階 1 (= request 宣言) | 人間 (発議者) | `adr: false` → ADR step は起動するが no-op (= LLM コスト最小、no-op message 1 turn のみ)。`adr: true` → 段階 2 へ |
| 段階 2 (= step 内 judge) | agent | 実装後の実態 (= delta spec + git diff + spec-review findings) を見て ADR-worthy か最終確定 |

`adr: true` で起動された後、agent が「実装後の実態にアーキテクチャ判断なし」と判定したら ADR 生成スキップ + 理由ログ。これで「`adr: true` と宣言したが結局判断要素がなかった」ケースの量産を防ぐ。

### 5. pipeline 内の位置: `code-review --approved→ adr-gen → pr-create`

- code-review が `approved` を返した時点で実装 + レビュー完了 → その直後に adr-gen を挟む → success で pr-create に進む
- 既存 transition `code-review --approved→ pr-create` を `code-review --approved→ adr-gen` に置換、`adr-gen --success→ pr-create` + `adr-gen --error→ escalate` を追加
- `code-fixer --approved→ code-review` (= code review loop) は維持、adr-gen は loop 外 (= approved 抜けで一度のみ実行)
- PR には ADR が含まれて review 可能
- delta spec のような 2 段階反映 (= change folder → spec-merge) ではなく、step 内で直接 `specrunner/adr/` に書く (= ADR は append-only で衝突しない)

### 6. step 内 judge の判断材料 (= openspec-workflow 参考)

agent に渡す入力:

- `request.md` (= `adr: true` の宣言、type、要件)
- change folder の delta spec (= 仕様変更があったか、新規 capability 追加か)
- `git diff <base>..<HEAD>` (= 実装変更の範囲・性質)
- spec-review findings (= 代替案・トレードオフ情報、`review-feedback-*.md`)
- review-feedback の Known Design Debt (= MEDIUM 以下でスキップされた構造的課題)

agent の出力:

- `yes` + ADR draft (= Michael Nygard 形式) → `specrunner/adr/ADR-NNNN-YYYY-MM-DD-slug.md` に書き出し
- `no` + 理由 (= 「アーキテクチャ判断なし」「単純な実装修正」等) → ログに残してスキップ

### 7. ADR フォーマット: Michael Nygard 方式

```markdown
# {Decision Title}

**Date**: YYYY-MM-DD
**Status**: accepted

## Context

何が問題で、この判断が必要になったのか。(2〜5 文)

## Decision

何を決定したのか。(1〜3 文)

## Alternatives Considered

### Alternative 1: {Name}
- **Pros**: 利点
- **Cons**: 欠点
- **Why not**: 不採用理由

### Alternative 2: {Name}
...

## Consequences

### Positive
- 利点

### Negative
- トレードオフ

### Risks
- リスクと緩和策

### Known Design Debt (= 該当時のみ)
- code-review で繰り返し指摘されたが修正スコープ外の構造的課題
```

### 8. `docs/architecture.md` の扱い

- untracked で残っている `docs/architecture.md` (= 2026-05-17 snapshot) は **削除**
- 横断 overview は維持せず、ADR の集合に責務を集約 (= 鳥瞰図が必要なら ADR 間のリンクで構成)

### 9. 過去判断の遡及 ADR 化

- **やらない** (= openspec-workflow も新規 request からのみ生成、遡及はしていない)
- 過去の archived design.md は judgment 軸を持つが、ADR フォーマットへの変換 + 削減コストが過大
- 必要であれば後追いで `specrunner adr create <slug>` 等の単独コマンド (= 本 request スコープ外、将来対応) で個別追加可能

### 10. 救済経路 (= 後追い ADR 作成)

- `adr: false` で merge 後に「やっぱり残すべきだった」と気づいた場合の救済 (= `specrunner adr create <slug>` 等) は **本 request スコープ外**
- 将来別 issue / request で対応

## 要件

### 1. request.md parser の拡張 (= `adr` フィールド必須化)

`src/parser/request-md.ts`:

- `adr` フィールド抽出 pattern: `/^\s*-\s+\*\*adr\*\*:\s+(true|false)\s*$/`
- 欠落 / 不正値 → `requestMdInvalidError` で reject (= `base-branch` validation と同等)
- 戻り値の型に `adr: boolean` を追加 (= existing `ParsedRequest` 拡張)

### 2. request generate prompt の拡張

`src/prompts/request-generate-system.ts`:

- Meta セクションに `- **adr**: <true|false>` を必須項目として追記
- 「ADR を残す基準」を prompt に明文化:
  - 新しい port / adapter を追加する
  - 既存パターンと違う設計選択をする (= 代替案が複数ある)
  - 振る舞い / 契約を変える bug-fix
  - 構造的なリファクタリング
  - 上記いずれにも該当しない場合は `false`

### 3. request template / scaffold への反映

`specrunner request template` で出力される scaffold:

- Meta セクションに `- **adr**: false` をデフォルト記載 (= 発議者が判断して書き換える)
- 判断基準コメント (= 上記基準) を template に含める

### 4. pipeline に `adr-gen` step を新設

新規 step 定義:

- step name: `adr-gen`
- kind: `agent`
- phase: `code` (= 実装完了後)
- pipeline 内位置: `code-review --approved→ adr-gen → pr-create` (= transition table 上、`code-review` が `approved` を返した先を `adr-gen` に置き換え、`adr-gen` の `success` で `pr-create` に進む)
- skip 条件: `request.adr === false` で step 起動なし (= pipeline 内で skip 判定)

step 実装 (`src/core/step/adr-gen.ts` 新設想定、最終配置は実装判断):

- `request.adr === false` → no-op、completed として通過
- `request.adr === true` → judge agent 呼び出し
  - 入力: 上記「設計判断 6」の材料
  - judge 結果が `no` → ADR 生成スキップ、理由を `result.message` に残す
  - judge 結果が `yes` → ADR を `specrunner/adr/ADR-NNNN-YYYY-MM-DD-slug.md` に書き出し、git add + commit

### 5. pipeline 構成への組み込み

`src/core/pipeline/run.ts` (= STANDARD_LOOP_FIXER_PAIRS や transition table の中心):

- transition table に以下 3 行を追加:
  - `adr-gen --success→ pr-create`
  - `adr-gen --error→ escalate`
- 既存行 `code-review --approved→ pr-create` を `code-review --approved→ adr-gen` に **置換**する
- `code-fixer --approved→ code-review` (= 既存 loop) は維持 (= adr-gen は loop 外)

### 6. `AgentStepName` / `STEP_NAMES` への追加

`src/core/step/step-names.ts` (= AGENT_STEP_NAMES 配列と STEP_NAMES オブジェクトの authoritative 定義):

- `AGENT_STEP_NAMES` 配列に `"adr-gen"` を追加 (= AgentStepName union が derive される)
- `STEP_NAMES` オブジェクトに `ADR_GEN: "adr-gen"` を追加

`src/state/schema.ts` の `AgentStepName` 型は `AGENT_STEP_NAMES` から derive されるため自動的に追従する (= schema.ts への直接編集は不要)

### 7. authority spec edit guard との整合 (= PR #294)

- `specrunner/adr/` 配下の編集は **authority spec ではない** (= prefix `specrunner/specs/` ではない)
- 既存の `AuthoritySpecEditViolation` guard は影響しない (= prefix check で自然に許可)

### 8. ADR draft の判断材料収集ロジック

agent 呼び出し前 (or agent prompt 内) で以下を収集:

- `specrunner/changes/<slug>/specs/` 配下の delta spec ファイル list
- `git diff <base-branch>..HEAD --name-only` の結果
- `specrunner/changes/<slug>/review-feedback-*.md` の Known Design Debt セクション (= 存在する場合)
- `specrunner/changes/<slug>/design.md` (= 設計判断の主出典)

### 9. ADR ファイル番号採番

- `specrunner/adr/` 配下を `ls` して既存 ADR の最大番号 + 1 を採番
- 競合状態 (= 同時に複数 request が ADR 生成) は本 request 範囲外 (= dogfood で並列 finish しない運用前提)

### 10. `docs/architecture.md` の削除

- 同 file が untracked で存在する場合は本 request 内で削除 (= implementer 作業の一部)
- commit 不要 (= 元々 untracked)

### 11. spec authority への反映

delta spec として `specrunner/changes/<slug>/specs/<capability>/spec.md` を新規作成し、`## ADDED Requirements` セクションで Requirement を記述する (= finish 時に spec-merge が baseline `specrunner/specs/<capability>/spec.md` を新規作成する経路。baseline 自体は本 PR で直接作成しない、`AUTHORITY_SPEC_GUARD_RULE` 準拠):

- 候補名: `adr-generation` (or `adr-step`)
- Purpose: ADR を request.md の `adr` フィールドに基づき生成する pipeline step の振る舞い
- Requirement:
  - `request.adr === false` → ADR step は no-op で通過する
  - `request.adr === true` → judge agent が ADR-worthy 判定を行う
  - judge=yes → `specrunner/adr/ADR-NNNN-YYYY-MM-DD-slug.md` 形式で ADR を生成する
  - judge=no → ADR 生成をスキップし、理由をログに残す
  - ADR は Michael Nygard 形式 (= Context / Decision / Alternatives Considered / Consequences) で記述する
  - ADR step は transition table 上、`code-review --approved→ adr-gen → pr-create` の位置で実行される

既存 capability への MODIFIED (= 同じ delta spec フォルダ内に追加で記述):

- `specrunner/changes/<slug>/specs/pipeline-orchestrator/spec.md` を作成し、`## MODIFIED Requirements` セクションで「Pipeline is Driven by a Declarative Transition Table」Requirement を新内容で書き直す (= 既存行 `code-review --approved→ pr-create` を `code-review --approved→ adr-gen` に置換し、`adr-gen --success→ pr-create` + `adr-gen --error→ escalate` の 2 行を transition table に追加した版)。baseline `specrunner/specs/pipeline-orchestrator/spec.md` は本 PR で直接編集しない、spec-merge 経由で finish 時に更新される
- `specrunner/changes/<slug>/specs/cli-commands/spec.md` (= scaffold 出力 = `request template` 部分に変更がある場合のみ) を delta spec として作成し `## MODIFIED Requirements` で対応 Requirement を書き直す

### 12. test

`tests/unit/parser/request-md.test.ts`:

- TC-ADR-PARSE-01: `adr: true` を含む request.md → 正常 parse、`adr === true`
- TC-ADR-PARSE-02: `adr: false` を含む request.md → 正常 parse、`adr === false`
- TC-ADR-PARSE-03: `adr` フィールド欠落 → `REQUEST_MD_INVALID` throw
- TC-ADR-PARSE-04: `adr: maybe` (= 不正値) → `REQUEST_MD_INVALID` throw

`tests/unit/core/step/adr-gen.test.ts` (= 新規 file):

- TC-ADR-STEP-01: `request.adr === false` → step 通過、ADR 生成なし
- TC-ADR-STEP-02: `request.adr === true` + judge=no → ADR 生成なし、理由ログ
- TC-ADR-STEP-03: `request.adr === true` + judge=yes → `specrunner/adr/ADR-{NNNN}-...md` 生成、git add 完了
- TC-ADR-STEP-04: ADR 番号採番 (= 既存 ADR 0 件 → 0001、3 件 → 0004 等)

`tests/pipeline-integration.test.ts`:

- TC-ADR-INT-01: transition table 上、`code-review --approved→ adr-gen` と `adr-gen --success→ pr-create` が遷移する。`code-fixer --approved→ code-review` (= 既存 loop) は維持される

### 13. 既存 active request の対応

- 本 request 自体 (= `adr: true`) と他 2 件 (= `resume-from-step-name` / `vitest-e2e-category-removal`、共に `adr: false`) は既に `adr` フィールドを含む
- 既存 active request `unify-changes-and-requests-4c546d23` (PR #252) は merge 前に手動で `adr` フィールド追記が必要 (= 本 request 実装後の対応、本 request 内では触らない)

## スコープ外

- `specrunner adr create <slug>` 等の単独 ADR 作成コマンド (= 救済経路、将来別 request)
- 過去の archived design.md からの遡及 ADR 化
- ADR 間のクロスリファレンス / index 自動生成
- ADR の status 遷移 (= proposed → accepted → deprecated → superseded) の自動管理
- 並列 finish 時の ADR 番号採番競合対策
- ADR の review / approval workflow (= 既存 code-review に乗せる)
- `docs/architecture.md` 相当の横断 overview の再構築 (= 削除後の再生成は行わない)

## 受け入れ基準

- [ ] `src/parser/request-md.ts` で `adr` フィールドが必須化され、欠落 / 不正値で `REQUEST_MD_INVALID` を throw する
- [ ] `src/prompts/request-generate-system.ts` で `adr` フィールドの説明と判断基準が明示されている
- [ ] `specrunner request template` の scaffold 出力に `- **adr**: false` と判断基準コメントが含まれる
- [ ] transition table が `code-review --approved→ adr-gen` + `adr-gen --success→ pr-create` + `adr-gen --error→ escalate` に更新されている (= 既存行 `code-review --approved→ pr-create` は削除される)
- [ ] `request.adr === false` の場合に ADR step が no-op で通過する
- [ ] `request.adr === true` + judge=no の場合に ADR 生成スキップ + 理由ログ
- [ ] `request.adr === true` + judge=yes の場合に `specrunner/adr/ADR-{NNNN}-{YYYY-MM-DD}-{slug}.md` が生成され、git add される
- [ ] ADR が Michael Nygard 形式 (= Context / Decision / Alternatives Considered / Consequences) で書き出される
- [ ] `src/core/step/step-names.ts` の `AGENT_STEP_NAMES` 配列に `"adr-gen"` が追加され、`STEP_NAMES` オブジェクトに `ADR_GEN: "adr-gen"` が追加されている (= `AgentStepName` 型は自動 derive)
- [ ] `specrunner/adr/` ディレクトリが新設され、`.gitkeep` または README で空ディレクトリ保持の対応がある
- [ ] `docs/architecture.md` が削除されている
- [ ] delta spec `specrunner/changes/<slug>/specs/adr-generation/spec.md` が `## ADDED Requirements` を持つ形で新規作成されている (= baseline `specrunner/specs/adr-generation/spec.md` は spec-merge 経由で finish 時に新規作成される、本 PR では作らない)
- [ ] 既存 test (= parser / pipeline) の regression なし
- [ ] `bun run typecheck && bun run test` が green
- [ ] dogfood (= 本 request 自体を `specrunner run` で実行) で `adr: true` 経路の動作確認が取れる

## Workflow Options

- enabled: []
