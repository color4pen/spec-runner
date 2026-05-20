# ADR: rules.md 集約 + Change Folder 配置 + Identity Priming による規律注入方式

- **Date**: 2026-05-20
- **Status**: Accepted
- **Slug**: rules-md-injection

## Context

spec-runner pipeline で ADR 配置事故が 4 件連続発生した（PR #339, #343, #344 および過去 1 件）。全て `docs/adr/` への誤配置であり、正規 path `specrunner/adr/{YYYY-MM-DD}-{slug}.md` が無視された。

事故メカニズム:

```
design agent（業界慣習 MADR の docs/adr/ 知識が context で発火）
  → design.md / tasks.md に docs/adr/... と記述
adr-gen agent（prompt は specrunner/adr/ を指定、ただし design.md 記述も見える）
  → design.md の path 指定に従う
  → docs/adr/<奇形>.md 生成
```

PR #342 で `SPEC_RUNNER_COMMON_CONTEXT` を `buildSystemPrompt` 経由で全 agent に強制 prepend する対策を投入済みだった。**それでも事故が発生した**。

根本原因の分析: system prompt 内の static 規律は agent にとって「与えられた前提（given）」であり、業界慣習（MADR の `docs/adr/NNN-...`）が context で発火すると given を上書きする瞬間がある。Anthropic prompt engineering guide の経験則として、agent が能動的に取得した情報（acquired）は context 内での重みが given より大きい。

## 決定

### 1. rules.md 集約方式の採用

`specrunner/rules.md` を project の規律 source of truth として新設し、以下の内容を集約する:

- システム概観（pipeline 11 step 構成、独立 session + artifact 経由連携）
- 思想原則（agent は semantic content のみ、path / format / 分類は tool / CLI が決定）
- 責任範囲（各 step の touch 可能 / 禁止領域テーブル）
- System Facts（ADR / Authority spec / Delta spec / Change folder / Request の正規 path 一覧）
- **ADR 配置の特記**（4 件事故対策、詳細は後述）
- Delta spec 記法（旧 `DELTA_SPEC_FORMAT` の内容を移動）
- Authority spec lifecycle（旧 `AUTHORITY_SPEC_GUARD` の内容を移動）

`src/prompts/fragments.ts` から `SPEC_RUNNER_COMMON_CONTEXT` / `AUTHORITY_SPEC_GUARD` / `DELTA_SPEC_FORMAT` を削除し、`buildSystemPrompt` の自動 prepend ロジックを廃止する。`buildSystemPrompt` は base + fragments の単純 join のみを担当する。

**残す fragment**: `COMMIT_DISCIPLINE`（振る舞いの具体ルール、Read させるものではない）、`PIPELINE_RULES`（code-review / spec-review 固有の scoring rule）。

### 2. Change Folder へのコピー + Read 強制の設計

`local.ts` / `managed.ts` の `setupWorkspace` で、request.md コピーと同じ機構により:

```
specrunner/rules.md → specrunner/changes/<slug>/rules.md
```

run 開始時に rules.md が change folder に配置されることで:

- agent が `specrunner/changes/<slug>/` を探索する際に自然に rules.md を発見できる
- change folder が self-contained になる（request.md / design.md / rules.md が同一ディレクトリ）
- `specrunner/rules.md` が存在しない場合は throw せず warning ログのみで続行（ENOENT ガード）

各 agent system prompt の **最初の paragraph** に以下の定型句を追加する（identity priming + Read 指示）:

```
あなたは spec-runner pipeline のステップ agent（{step name}）です。
作業開始前に rules.md（= `specrunner/changes/<slug>/rules.md`）を Read tool で読み、規律を確認してから着手してください。
```

対象 agent: design / spec-review / spec-fixer / test-case-gen / implementer / build-fixer / code-review / code-fixer / adr-gen / request-generate / request-review（独自 system prompt ファイルを持つ全 step）。

### 3. Identity Priming + Acquired Information の設計原理

| 規律の与え方 | agent の認知 |
|---|---|
| system prompt 内に static 注入（given） | 「与えられた前提」、業界慣習に上書きされやすい |
| **Read tool で取得（acquired）** | 「自分で読んだ事実」、業界慣習を打ち消しやすい |

identity priming（「あなたは spec-runner の agent」）と constraint binding（「rules.md を Read して規律の中で行動」）を組み合わせることで:

- 業界慣習が発動した瞬間に identity が打ち消す心理構造
- Claude 4.x で aggressive language（MUST / CRITICAL）を避けつつ強い role 固定が効く
- 推定改善率: 93-97%（tool 化の 100% を諦め、dual runtime 互換性を取った設計判断）

### 4. 業界慣習 MADR の明示的不採用

rules.md の「ADR 配置の特記」セクションに以下を明示する:

- ADR の path / ファイル名は **adr-gen 以外の step で記載しない**（design.md / tasks.md に書かない）
- 業界慣習 MADR の `docs/adr/NNN-...` 形式は **採用しない**（本 project 規約: `specrunner/adr/{YYYY-MM-DD}-{slug}.md`）
- 他 step が「ADR を作成すべき」と提案する時は **具体 path を指定しない**（adr-gen に委ねる）

## 検討した代替案

| 案 | 評価 | 不採用理由 |
|---|---|---|
| tool 化（write_adr toolHandler） | 100% 強制 | managed runtime 限定。local / codex で効かない。本 project は dual runtime 前提 |
| post-process rename（CLI が後から file move） | 100% 強制 | 配置場所変更は本 request スコープ外、別 PR で検討 |
| session resume + correction | 99% | managed runtime 限定 |
| MUST / CRITICAL 強調の強化 | 5-10% 改善 | Claude 4.x で aggressive language は逆効果リスク。根本解決にならない |
| SPEC_RUNNER_COMMON_CONTEXT 継続 + 文言強化 | 限界あり | PR #342 で既に投入済み。4 件目の事故が発生した時点で方式の限界が確定 |

## リスクと受容判断

**[Risk] rules.md を Read しない agent が出現する**
- Mitigation: system prompt 冒頭定型句 + 静的 unit test（全 agent prompt が Read 指示を含むことを assert）
- 完全保証ではないが given 注入より強い

**[Risk] 静的 unit test の限界**
- `rules-md.test.ts` は入力側の構造的ガード（prompt や rules.md の静的内容）を検証するもの
- agent が実際に出力する design.md 内の path 文字列は検証対象外
- 受容判断: LLM の出力挙動を静的テストで保証することは原理的に不可能。完全な保証には post-process rename（別 PR）が必要

**[Risk] change folder 内の rules.md が上書きされうる**
- design step の write 可能パス内（change folder）に rules.md が存在する
- cross-job への影響は worktree 分離によって防がれており、最悪ケースは同一 job 内のみ
- 受容判断: spec-runner の agent は外部入力を直接 write することはなく、脅威モデルは悪意あるユーザーではなく buggy agent に限定される

## Consequences

- `SPEC_RUNNER_COMMON_CONTEXT` / `AUTHORITY_SPEC_GUARD` / `DELTA_SPEC_FORMAT` が fragments.ts から削除され、規律の single source of truth が `specrunner/rules.md` に集約される
- `buildSystemPrompt` が base + fragments の単純 join に簡素化される（自動 prepend 廃止）
- 全 agent が run 開始時に rules.md を change folder で発見し、Read で能動的に取得する設計になる
- 静的 unit test（`tests/unit/rules-md.test.ts`）により rules.md の構造的内容と全 agent prompt の Read 指示を CI でガードする
- context window の net change はほぼゼロ（system prompt から削除した分と rules.md Read の分が相殺）

## Files Changed

| File | Change |
|------|--------|
| `specrunner/rules.md` | 新設（ADR 配置特記含む全規律の SoT） |
| `src/core/runtime/local.ts` | `setupWorkspace` に rules.md コピー処理（ENOENT ガード付き）追加 |
| `src/core/runtime/managed.ts` | 同上 |
| `src/prompts/fragments.ts` | `SPEC_RUNNER_COMMON_CONTEXT` / `AUTHORITY_SPEC_GUARD` / `DELTA_SPEC_FORMAT` 削除 |
| `src/prompts/builder.ts` | `SPEC_RUNNER_COMMON_CONTEXT` 自動 prepend 廃止、単純 join に簡素化 |
| `src/prompts/design-system.ts` | identity priming 定型句追加 |
| `src/prompts/spec-review-system.ts` | 同上 |
| `src/prompts/spec-fixer-system.ts` | 同上 |
| `src/prompts/test-case-gen-system.ts` | 同上 |
| `src/prompts/implementer-system.ts` | 同上 |
| `src/prompts/build-fixer-system.ts` | 同上 |
| `src/prompts/code-review-system.ts` | 同上 |
| `src/prompts/code-fixer-system.ts` | 同上 |
| `src/prompts/adr-gen-system.ts` | 同上 |
| `src/prompts/request-generate-system.ts` | 同上 |
| `src/prompts/request-review-system.ts` | 同上 |
| `src/util/copy-artifacts.ts` | rules.md / request.md コピーの共通ヘルパー |
| `src/util/paths.ts` | `rulesSourcePath` / `rulesDestPath` ヘルパー追加 |
| `tests/unit/rules-md.test.ts` | 新規（rules.md 内容 + 全 agent Read 指示の静的 assert） |
| `tests/unit/prompts/common-context-catch.test.ts` | 新設計（Read 指示 + rules.md 本文）に合わせて書き換え |
| `tests/unit/prompts/fragment-coverage.test.ts` | 削除 fragment に合わせて対応表更新 |

## 関連 ADR

- [2026-05-20-prompt-common-context-injection](./2026-05-20-prompt-common-context-injection.md) — 本 ADR が supersede する。PR #342 で投入した SPEC_RUNNER_COMMON_CONTEXT 強制 prepend 方式は本変更で廃止。
