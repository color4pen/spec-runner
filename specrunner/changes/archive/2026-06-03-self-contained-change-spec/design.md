# Design: self-contained-change-spec

## Context

現状の spec モデルは「baseline に対する差分（delta spec）」として設計されており、`specrunner/changes/<slug>/specs/<capability>/spec.md` に capability 別に分割配置される。この delta spec のフォーマットは `src/core/spec/rules/` 配下の 11 ルールで機械検証され、違反があれば `delta-spec-validation` → `delta-spec-fixer` ループで自動修正される。

ADR-20260602（spec-model）D1/D2 に基づき、spec を「その作業で達成する Layer-1 振る舞いの自己完結記述」に再定義する。spec は authority ではなく test への入力であり、品質は spec-review の意味的レビューと test suite が担保する。rule ベースの機械検証は不要になる。

影響範囲:
- pipeline: 2 step 削除（delta-spec-validation, delta-spec-fixer）、遷移テーブル再配線
- step 定義: 2 ファイル削除 + step-names からの除去
- rules/validator: `src/core/spec/rules/` ディレクトリ全体 + `delta-spec-validator.ts` 削除
- prompts: 6+ ファイルの "delta" 関連文言更新
- templates: `delta-spec-template.md`（B-group）廃止、`spec.md` を A-group 化
- paths: `deltaSpecValidationResultPath`, `rulesDestPath` 等の不要 helper 削除
- tests: 4 テストファイル削除

## Goals / Non-Goals

**Goals**:
- 1 作業 = 1 自己完結 `spec.md` ファイル（`specrunner/changes/<slug>/spec.md`）
- rule ベースの spec 検証を全廃（step, validator, rules registry, fixer）
- "delta" 命名を全廃（step 名, template 名, path helper, prompt 文言）
- design step が `spec.md` を A-group template として配置（agent が書き込み、永続）
- spec-review が baseline を参照せず `spec.md` の各セグメントを意味的にレビュー
- test-case-gen が新しい `spec.md` パスを読む

**Non-Goals**:
- `specrunner/specs/` baseline corpus の物理削除（別リクエスト）
- spec-review の廃止（残す）
- spec-fixer の廃止（spec-review → spec-fixer ループは存続）

## Decisions

### D1: spec ファイル配置を `specrunner/changes/<slug>/spec.md` に変更

capability 別ディレクトリ（`specs/<capability>/spec.md`）をやめ、change folder 直下に単一 `spec.md` を配置する。

- **Rationale**: 1 作業 = 1 spec の原則。capability 分割は baseline delta モデルの名残であり、自己完結 spec では不要。
- **Alternatives**: `specs/spec.md` を残す案 → パス階層が冗長で利点がない。

### D2: pipeline から delta-spec-validation / delta-spec-fixer を削除

遷移テーブルから 2 step を除去し、直結ルートに再配線する:
- `design` → `spec-review`（直接）
- `spec-fixer` → `spec-review`（直接、旧: spec-fixer → delta-spec-validation → spec-review）
- `code-review approved` → `adr-gen`（直接、旧: code-review → delta-spec-validation → adr-gen）
- `code-fixer approved (after code-review approved)` → `adr-gen`（直接）

- **Rationale**: rule 検証が不要になれば validation step は存在意義がない。fixer も validation の従属 step であるため同時廃止。
- **Alternatives**: validation を空通し（常に approved）→ dead code を残す意味がない。

### D3: `src/core/spec/rules/` ディレクトリと `delta-spec-validator.ts` を全削除

11 ルール + registry + parser + validator + types すべて削除。

- **Rationale**: consumer が 0 になる。削除対象はすべて delta-spec-validation step からのみ参照される。
- **Alternatives**: 将来の再利用のために残す → YAGNI。必要になれば git history から復元できる。

### D4: `delta-spec-template.md`（B-group）を廃止し、`spec.md` を A-group template 化

現状: design step 前に B-group `delta-spec-template.md` を配置 → agent が Read して参考にし、`specs/<capability>/spec.md` に書く → step 後に B-group ファイルを削除。

新: design step 前に A-group `spec.md` を `specrunner/changes/<slug>/spec.md` に配置 → agent が直接上書き → 永続（削除しない）。

scaffold 内容は Requirement / Scenario / normative keyword の書き方ガイダンスを HTML コメントで持たせる（記述項目の指針を残す）。

- **Rationale**: A-group は配置 → agent 上書きの単純フローで、cleanup 不要。B-group の「読んで別パスに書く」間接性が不要になる。
- **Alternatives**: design prompt に全指針を埋め込む → prompt が肥大化。template の HTML コメントに持たせる方が分離できる。

### D5: spec-review から baseline 参照ロジックを除去

「Baseline Spec Consistency Check」セクション全体と「Delta Spec Presence Check」の capability-dir 前提チェックを除去。代わりに `spec.md` の各定義セグメントを意味的にレビューする指示に書き換える。

spec-review prompt の「Baseline Spec Consistency Check」は baseline を Read して header 一致を確認する指示 → 削除。「Delta Spec Presence Check」は `specs/` ディレクトリの存在確認 → `spec.md` ファイルの存在確認に変更。

- **Rationale**: 自己完結 spec は baseline との差分ではないため、baseline 参照は無意味。
- **Alternatives**: baseline 参照を optional に残す → 混乱の元。

### D6: step-names から delta 系定数を削除

`AGENT_STEP_NAMES` から `"delta-spec-fixer"` を、`CLI_STEP_NAMES` から `"delta-spec-validation"` を、`STEP_NAMES` から `DELTA_SPEC_VALIDATION` / `DELTA_SPEC_FIXER` を削除。

`kernel/agent-definition.ts` の `AgentStepName` union からも `"delta-spec-fixer"` を削除。

- **Rationale**: step が消えれば名前定数も不要。型安全を維持するため union から除外が必要。

### D7: rules.md の delta spec 記法セクションを更新

`RULES_MD_CONTENT`（`src/prompts/rules.ts`）から delta-spec-validation 前提の記述を除去し、自己完結 spec.md の書き方指針に書き換える。`rulesDestPath` / `copyRulesToChangeFolder` は rules.md が存続するため維持（delta spec 記法セクションの中身のみ変更）。

- **Rationale**: rules.md は全 agent が読む規律ドキュメントであり、delta 前提の記述を残すと agent が混乱する。
- **Alternatives**: rules.md 自体を廃止 → 別スコープ。今回は中身の更新のみ。

### D8: paths.ts の不要 helper 削除

`deltaSpecValidationResultPath` を削除。`rulesDestPath` は rules.md 配置に使われるため残す。

- **Rationale**: 参照元（delta-spec-validation step）が消えるため。

## Risks / Trade-offs

[Risk] 既存 change folder に `specs/<capability>/spec.md` が残っている
→ Mitigation: 既存 change は影響しない（archive 済み or in-flight なし前提）。新規 change のみ `spec.md` 配置。

[Risk] spec-review が baseline 参照を失うことで、既存要件との整合性チェックが弱くなる
→ Mitigation: spec-review は意味的レビューとして残る。baseline corpus は Read 可能（path は残る）。必要に応じて spec-review が自主的に参照できるが、強制はしない。architect 評価済み。

[Risk] prompt 更新箇所が多く見落としやすい
→ Mitigation: tasks を prompt ファイル単位で分割し、grep "delta" で残存確認。

## Open Questions

なし（architect 評価済み）。
