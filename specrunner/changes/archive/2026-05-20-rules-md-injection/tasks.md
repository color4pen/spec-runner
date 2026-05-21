# Tasks: rules-md-injection

## T-01: `specrunner/rules.md` の新設

- [x] `specrunner/rules.md` を作成し、以下のセクションを含める:
  - `## spec-runner: System Context` — pipeline 概要（10 step state machine）、独立 session + artifact 経由連携の説明。現 `SPEC_RUNNER_COMMON_CONTEXT` の Pipeline Structure セクションを移植
  - `## 思想原則` — agent は semantic content のみ担当、format / path は tool が決定、`<user-request>` タグルール。現 `SPEC_RUNNER_COMMON_CONTEXT` の思想原則セクションを移植
  - `## 責任範囲` — 各 step の touch 可能 / 禁止領域テーブル + 共通禁止事項。現 `SPEC_RUNNER_COMMON_CONTEXT` の責任範囲セクションを移植
  - `## System Facts` — ADR / Authority spec / Delta spec / Change folder / Job state / Verbose log の正規 path 一覧。現 `SPEC_RUNNER_COMMON_CONTEXT` の System Facts セクションを移植
  - `## ADR 配置の特記` — **新規セクション**。以下を明記:
    - ADR の path / ファイル名は adr-gen 以外の step で記載しない（design.md / tasks.md に書かない）
    - 業界慣習 MADR の `docs/adr/NNN-...` 形式は採用しない（project 規約で `specrunner/adr/{YYYY-MM-DD}-{slug}.md` を正規）
    - 他 step が「ADR を作成すべき」と提案する時は具体 path を指定しない（adr-gen に委ねる）
  - `## spec authority lifecycle` — 現 `AUTHORITY_SPEC_GUARD` の内容を移植（正規経路 / 書く側の規律 / 見る側の規律）
  - `## delta spec 記法` — 現 `DELTA_SPEC_FORMAT` の内容を移植（セクションヘッダー / ルール / ファイル配置）

**受け入れ基準**: `specrunner/rules.md` が存在し、上記 7 セクションを含む。既存 fragments.ts の SPEC_RUNNER_COMMON_CONTEXT / AUTHORITY_SPEC_GUARD / DELTA_SPEC_FORMAT の内容が漏れなく移植されている。

---

## T-02: worktree setup での rules.md コピー

- [x] `src/core/runtime/local.ts` の `setupWorkspace` メソッド（L201-247 の request.md コピー処理の後）に rules.md コピーを追加:
  - `specrunner/rules.md` → `<worktreePath>/specrunner/changes/<slug>/rules.md` にコピー
  - **前提条件**: `specrunner/rules.md` は T-01 で新設済み。worktree は main から作成されるため rules.md を含む（`path.join(worktreePath, "specrunner/rules.md")`）
  - **ENOENT ガード**: `fs.access(src)` で存在確認してから `fs.cp(src, dst)` を実行する。ファイルが存在しない場合は ENOENT で throw せず warning ログのみ出力して続行する（non-fatal）
  - `git add specrunner/changes/<slug>/rules.md` でステージング（non-fatal: 失敗時は warning のみ）
  - request.md と同じ commit に含める（commit message 変更不要 — rules.md は request.md と同タイミング）
- [x] `src/core/runtime/managed.ts` の `setupWorkspace` メソッド（L92-151 の request.md コピー処理の後）に同様の rules.md コピーを追加:
  - `specrunner/rules.md` → `specrunner/changes/<slug>/rules.md` にコピー
  - **ENOENT ガード**: local.ts と同様に `fs.access` で存在確認してから `fs.cp` を実行（non-fatal）
  - `git add` + 既存の commit に含める

**受け入れ基準**: run 開始時に `specrunner/changes/<slug>/rules.md` が change folder に配置される。request.md と同じ初期 commit に含まれる。`specrunner/rules.md` が存在しない場合でも setupWorkspace は throw せず warning のみで続行する。

---

## T-03: 全 agent system prompt に identity priming + Read 指示を追加

- [x] 以下の 11 ファイルの BASE 変数（`buildSystemPrompt` に渡す base 文字列）の **冒頭** に定型句を追加:

対象ファイルと step name の対応:

| ファイル | step name |
|---------|-----------|
| `src/prompts/design-system.ts` | design |
| `src/prompts/spec-review-system.ts` | spec-review |
| `src/prompts/spec-fixer-system.ts` | spec-fixer |
| `src/prompts/test-case-gen-system.ts` | test-case-gen |
| `src/prompts/implementer-system.ts` | implementer |
| `src/prompts/build-fixer-system.ts` | build-fixer |
| `src/prompts/code-review-system.ts` | code-review |
| `src/prompts/code-fixer-system.ts` | code-fixer |
| `src/prompts/adr-gen-system.ts` | adr-gen |
| `src/prompts/request-generate-system.ts` | request-generate |
| `src/prompts/request-review-system.ts` | request-review |

定型句テンプレート:

```
あなたは spec-runner pipeline のステップ agent（{step name}）です。
作業開始前に rules.md（= `specrunner/changes/<slug>/rules.md`）を Read tool で読み、規律を確認してから着手してください。
```

- [x] 各ファイルで、既存の base 文字列の冒頭（最初の行）の前に上記定型句を挿入する。既存の `あなたは ... agent です` 行がある場合は、定型句の identity 部分と統合して重複を避ける

**受け入れ基準**: 全 11 agent system prompt が冒頭に identity priming + Read 指示を含む。

---

## T-04: fragments.ts からの削除 + buildSystemPrompt 簡素化

- [x] `src/prompts/fragments.ts` から以下の export を削除:
  - `SPEC_RUNNER_COMMON_CONTEXT`
  - `AUTHORITY_SPEC_GUARD`
  - `DELTA_SPEC_FORMAT`
- [x] 残す export: `COMMIT_DISCIPLINE`、`PIPELINE_RULES`
- [x] `src/prompts/builder.ts` の `buildSystemPrompt` を変更:
  - `SPEC_RUNNER_COMMON_CONTEXT` の import を削除
  - prepend ロジックを削除: `[SPEC_RUNNER_COMMON_CONTEXT, base, ...fragments]` → `[base, ...fragments]`
  - 関数シグネチャは変更なし
- [x] 各 agent system prompt ファイルから、削除した fragment の import と `buildSystemPrompt` 呼び出しの fragments 配列からの参照を除去:
  - `AUTHORITY_SPEC_GUARD` を使用しているファイル: design-system.ts, spec-fixer-system.ts, code-fixer-system.ts, implementer-system.ts, spec-review-system.ts, code-review-system.ts
  - `DELTA_SPEC_FORMAT` を使用しているファイル: design-system.ts, spec-fixer-system.ts, code-fixer-system.ts, implementer-system.ts
  - import 文と fragments 配列の両方から削除

**受け入れ基準**: fragments.ts に `COMMIT_DISCIPLINE` と `PIPELINE_RULES` のみが残る。buildSystemPrompt は base + fragments の join のみ。各 prompt ファイルのコンパイルが通る。

---

## T-05: test 更新 — fragment-coverage.test.ts

- [x] `tests/unit/prompts/fragment-coverage.test.ts` を更新:
  - `SPEC_RUNNER_COMMON_CONTEXT` / `AUTHORITY_SPEC_GUARD` / `DELTA_SPEC_FORMAT` の import を削除
  - EXPECTED 対応表から、削除した fragment への参照を除去:
    - IMPLEMENTER: `[COMMIT_DISCIPLINE]` のみ
    - DESIGN: `[]`
    - SPEC_FIXER: `[COMMIT_DISCIPLINE]`
    - CODE_FIXER: `[COMMIT_DISCIPLINE]`
    - BUILD_FIXER: `[COMMIT_DISCIPLINE]`
    - ADR_GEN: `[COMMIT_DISCIPLINE]`
    - SPEC_REVIEW: `[PIPELINE_RULES]`
    - CODE_REVIEW: `[PIPELINE_RULES]`
    - TEST_CASE_GEN: `[]`
    - REQUEST_GENERATE: `[]`
    - REQUEST_REVIEW: `[]`
  - `SPEC_RUNNER_COMMON_CONTEXT` injection の describe ブロック全体を削除（もはや system prompt に含まれない）

**受け入れ基準**: test が green。削除した fragment の assertion が存在しない。

---

## T-06: test 更新 — common-context-catch.test.ts

- [x] `tests/unit/prompts/common-context-catch.test.ts` を新設計に合わせて書き換え:
  - 旧 assertion（`specrunner/adr/` / `specrunner/specs/` / `specrunner/changes/` の path 文字列が system prompt に含まれる）を削除
  - 新 assertion を追加:
    1. **rules.md Read 指示**: 全 11 agent prompt が `specrunner/changes/<slug>/rules.md` への Read 指示文字列を含む
    2. **rules.md 本文**: `specrunner/rules.md` ファイルが存在し、ADR 配置規律セクション（「業界慣習 MADR」「採用しない」「adr-gen 以外」等のキーワード）を含む
    3. **rules.md 内の正規 path**: rules.md に `specrunner/adr/{YYYY-MM-DD}-{slug}.md` の path 文字列が含まれる
  - TC-31 の構造テスト（11 agents / tuple 形式）は維持

**受け入れ基準**: test が green。rules.md Read 指示 + rules.md 本文の二重検証が成立。

---

## T-07: 静的 unit test 新設 — rules-md.test.ts

- [x] `tests/unit/rules-md.test.ts` を新規作成:
  - `specrunner/rules.md` が存在する（fs.access で検証）
  - rules.md に「ADR 配置の特記」セクションが存在する（キーワード: 「業界慣習 MADR」「採用しない」「adr-gen 以外」）
  - rules.md に `specrunner/adr/` の正規 path 文字列が含まれる
  - 全 11 agent system prompt が `specrunner/changes/<slug>/rules.md` を含む Read 指示を含む（文字列 contains）
  - design / code-review / code-fixer prompt が `docs/adr/` への明示的言及を含まない（業界慣習の発動防止）

**受け入れ基準**: test が green。PR #339 / #343 / #344 同型ケースの構造的 catch が成立。

---

## T-08: typecheck + test green 確認

- [x] `bun run typecheck` が green
- [x] `bun run test` が green

**受け入れ基準**: CI 相当の検証が通る。
