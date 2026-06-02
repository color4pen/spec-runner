# ADR-20260603: spec を自己完結記述に再定義し、rule ベース検証を全廃する

## ステータス

accepted

## コンテキスト

旧モデルでは spec は「`specrunner/specs/` baseline に対する差分（delta spec）」として設計されていた。

- 配置: `specrunner/changes/<slug>/specs/<capability>/spec.md`（capability 別ディレクトリ分割）
- フォーマット検証: `src/core/spec/rules/` 配下の 11 ルール（baseline header 一致・normative keyword・Scenario 必須など）
- pipeline: `delta-spec-validation` step が検証を実行し、違反があれば `delta-spec-fixer` step が自動修正
- template: B-group `delta-spec-template.md` を配置 → agent が参照して `specs/<capability>/spec.md` に書く → step 後に削除

このモデルには以下の問題があった:

1. **spec の consumer が LLM のみ**（test-case-gen / spec-review）。人間向け規約チェックと同じ機械検証は LLM 入力品質の担保手段として過剰であり、ルールへの準拠がそのまま意味的な正しさを保証しない。
2. **rule 検証が品質の proxy になっていた**。フォーマットが正しくても内容が不十分な spec は rule を通過する。実質的な品質は spec-review（意味的）と test suite が担保する。
3. **capability 分割の根拠が baseline delta**。baseline 差分を capability 別に記述するためのディレクトリ構造であり、自己完結記述では不要な間接性。
4. **pipeline に dead code が生まれるリスク**。delta-spec-validation → delta-spec-fixer ループを維持し続けると、spec 品質の責務が「ルール通過」に固定されたまま spec-review が形骸化する。

## 決定

spec を「その作業で達成する Layer-1 振る舞いの自己完結記述」に再定義し、rule ベース検証を全廃する。

### D1: spec ファイルを `specrunner/changes/<slug>/spec.md` に一本化

capability 別ディレクトリをやめ、change folder 直下に単一 `spec.md` を配置する。1 作業 = 1 spec が原則。capability 分割は baseline delta モデルの名残であり、自己完結記述では不要な階層。

### D2: pipeline から `delta-spec-validation` / `delta-spec-fixer` を削除

遷移テーブルを再配線:

- `design` → `spec-review`（直接）
- `spec-fixer` → `spec-review`（直接）
- `code-review approved` → `adr-gen`（直接）

rule 検証が不要になれば validation step は存在意義がなく、fixer は validation の従属 step として同時廃止する。

### D3: `src/core/spec/rules/` と `delta-spec-validator.ts` を全削除

11 ルール + registry + parser + validator + types すべて削除。参照元（delta-spec-validation step）が消えるため consumer が 0 になる。必要になれば git 履歴から復元できる（YAGNI）。

### D4: `delta-spec-template.md`（B-group）を廃止し、`spec.md` を A-group template 化

design step 前に A-group `spec.md` を `specrunner/changes/<slug>/spec.md` に配置し、agent が直接上書きする。B-group の「参照テンプレートを読んで別パスに書く → step 後に削除」という間接フローをなくす。記述項目の指針（Requirement / Scenario / normative keyword）は `spec.md` の scaffold（HTML コメント）として持たせる。

### D5: spec-review から baseline 参照ロジックを除去

「Baseline Spec Consistency Check」セクション（baseline を Read して header 一致確認）と「Delta Spec Presence Check」の capability-dir 前提チェックを削除。代わりに `spec.md` の各定義セグメントを意味的にレビューする指示に置き換える。自己完結 spec は baseline との差分ではないため baseline 参照は無意味。

### D6: "delta" 命名を全廃

step 名（`DELTA_SPEC_VALIDATION` / `DELTA_SPEC_FIXER`）、template 名（`DELTA_SPEC_TEMPLATE`）、path helper（`deltaSpecValidationResultPath`）、prompt 文言を一掃する。`spec.md` は型制御フローから参照されない artifact であるため命名の型安全は path 文字列で十分。

### D7: `rules.md` の delta spec 記法セクションを更新

`RULES_MD_CONTENT` から delta-spec-validation 前提の記述を除去し、自己完結 spec.md の書き方指針（Requirement / Scenario / normative keyword の使い方）に書き換える。`rulesDestPath` / `copyRulesToChangeFolder` は rules.md が存続するため維持。

## spec の位置づけ（新モデル）

- **spec は authority ではなく test への入力**。振る舞いの真実は test suite + 構造の歯（CODEOWNERS-gated arch tests）が担う。
- **品質担保の順序**: spec-review（意味的・各セグメントの正しさ・不足）→ test suite（実行検証）。rule ベースのフォーマット検証はこの chain に不要。
- **test は spec の Scenario を primary source とするが spec 外の要素もカバーする**。spec が取りこぼす範囲は test 側で守る。
- **spec-review は廃止しない**。baseline 参照を失うが、自己完結 spec の各定義セグメントを意味的に評価する役割として残る。

## 検討した代替案

### Alternative 1: delta-spec-validation を常時 approved の空通しにして step を維持する

- **Pros**: pipeline の遷移テーブルを変更せずに済む。既存テストコードの削除を回避できる。
- **Cons**: rule 検証コードと step 定義が dead code として残る。「validation step が存在する = フォーマット準拠が品質基準」という誤った認識が定着し、spec-review の意味的レビューが形骸化するリスクがある。
- **Why not**: 削除対象の目的がゼロになった時点で dead code を維持し続ける理由がない。step の存在自体が「rule 検証が品質担保に必要」という誤った信号を発し続ける。

### Alternative 2: baseline 参照を optional（強制なし）として spec-review に残す

- **Pros**: 既存の spec-review ロジックを最小変更で維持できる。agent が必要と判断した際に baseline を参照できる柔軟性が残る。
- **Cons**: optional 指示は agent に「baseline を読むべきか否か」の判断コストを残す。「baseline を読むべき場合とそうでない場合」の判断基準が prompt に明示されない限り、agent の動作が不安定になる。
- **Why not**: 自己完結 spec は baseline との差分でないため baseline 参照は設計上不要。必要であれば agent が自主的に読める（baseline corpus の path は残る）ため、prompt で強制する必要がない。

### Alternative 3: capability ディレクトリを維持し `specs/spec.md` を単一ファイルにする

- **Pros**: 既存の change folder 構造と近い形を保てる。capability 名がパスに残り、将来 capability ごとの管理が必要になった場合に対応しやすい。
- **Cons**: `specs/` 階層は capability 分割（baseline delta モデル）の名残であり、単一 spec になった後は意味のない間接性。`specrunner/changes/<slug>/specs/spec.md` より `specrunner/changes/<slug>/spec.md` の方がパスが短く明快。
- **Why not**: 1 作業 = 1 spec の原則に `specs/` 階層は不要。将来 capability 分割が必要になれば別途設計すればよく、現時点で中間ディレクトリを残す理由がない（YAGNI）。

### Alternative 4: spec 記述指針を design prompt に埋め込み、`spec.md` scaffold を廃止する

- **Pros**: template ファイルの管理が不要になる。agent が参照するファイル数が減る。
- **Cons**: design system prompt が肥大化し、他の設計指示（tasks.md 生成・design.md 構造など）と記述指針が混在する。prompt の責務が増えると整合性の維持が難しくなる。
- **Why not**: 指針を `spec.md` scaffold の HTML コメントに持たせることで、prompt と template の責務を分離できる。agent は A-group `spec.md` を直接上書きするため、scaffold の HTML コメントが自然な記述ガイダンスになる。

### Alternative 5: rules / validator を将来の再利用のために残す（削除せず）

- **Pros**: 将来 rule ベース検証を再導入する場合に実装を再利用できる。git 操作なしで参照できる。
- **Cons**: consumer が 0 になったコードを src/ に残すと、import 参照の有無に関係なく codebase の認知負荷が上がる。「なぜ使われていないのか」の説明コストが生じる。
- **Why not**: YAGNI。rule ベース検証を再導入する設計判断があれば、その時点で git 履歴から復元できる。dead code は削除が原則。

## 影響

- pipeline から 2 step（delta-spec-validation / delta-spec-fixer）が消え、遷移グラフが単純化される
- `src/core/spec/rules/`（11 ルール + parser + registry + types）と `delta-spec-validator.ts` が削除される
- 新規 change は `specrunner/changes/<slug>/spec.md` に単一 spec を持つ
- 既存 archive 済み change の `specs/<capability>/spec.md` は影響を受けない（物理削除は別リクエスト `baseline-capability-consolidation` のスコープ）
- spec-review が baseline を参照しない意味的レビューに移行し、rule チェックの false-safety から脱する
- test-case-gen が新しい `specrunner/changes/<slug>/spec.md` パスを読む

本 ADR は以下の ADR を **supersede しない**が実質的に無効化する:
- `2026-05-19-delta-spec-auto-classification.md`（delta marker 分類）
- `2026-05-19-baseline-header-consistency-check.md`（baseline header 一致チェック）
- `2026-05-25-delta-validation-post-code-review.md`（code-review 後 delta 検証）
- `2026-05-18-validation-rule-interface.md`（rule インターフェース設計）
- `2026-05-19-delta-spec-rule-name-typesafe.md`（rule 名 type-safe）

## 参照

- Request: `specrunner/changes/self-contained-change-spec/request.md`
- Design: `specrunner/changes/self-contained-change-spec/design.md`
- Related: `specrunner/adr/2026-06-02-test-case-gen-scenario-primary-source.md`（Scenario primary source、本 ADR の新 spec.md パスに追随）
- Related: `specrunner/adr/2026-05-31-retire-contract-authority.md`（authority の集約方針）
