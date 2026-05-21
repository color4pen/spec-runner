# 規律を `rules.md` 集約 + change folder 配置 + identity priming で全 agent に注入する

## Meta

- **type**: spec-change
- **slug**: rules-md-injection
- **base-branch**: main
- **adr**: true

## 背景

spec-runner pipeline で **ADR 配置事故が 4 件連続発生**:

- PR #339: `docs/adr/001-tsconfig-build-separation.md` (= 旧形式番号制)
- PR #343: `docs/adr/002-cli-noun-verb-restructure.md` (= 旧形式)
- PR #344: `docs/adr/flatten-request-files.md` (= 番号も日付もなし、奇形)
- 過去にも 1 件

正規 path は `specrunner/adr/{YYYY-MM-DD}-{slug}.md`。事故メカニズム:

```
design agent (= 業界慣習 MADR の docs/adr/ 知識が context で発火)
   ↓ design.md / tasks.md に `docs/adr/...` と記述
adr-gen agent (= prompt は specrunner/adr/ を指定、ただし design.md 記述も見える)
   ↓ design.md の path 指定に従う
docs/adr/<奇形>.md 生成
```

### 既存対策の限界

PR #342 で `SPEC_RUNNER_COMMON_CONTEXT` を導入し全 agent に system prompt 強制 prepend 済。`AUTHORITY_SPEC_GUARD` / `DELTA_SPEC_FORMAT` も注入済。**それでも事故が発生** = system prompt 内の static 規律 (= given) は agent の認知に残りにくく、業界慣習 (= MADR) が context で勝つ瞬間がある。

### 検討した構造解の評価

| 案 | 評価 | 不採用理由 |
|---|---|---|
| tool 化 (= write_adr toolHandler) | 100% 強制 | runtime 偏り (= managed 限定、local / codex で効かない) |
| post-process rename (= CLI が後から file move) | 100% | 配置場所変更は本 request スコープ外、別検討 |
| session resume + correction (= managed sessions.events.send) | 99% | managed 限定 |
| prompt patchwork (= MUST / CRITICAL 強化) | 5-10% 改善 | Claude 4.x で aggressive language は dial back 推奨、逆効果 |
| **rules.md acquired information + identity priming** | **93-97%** | **採用** |

## 思想

### Acquired vs Given

| 規律の与え方 | agent の認知 |
|---|---|
| system prompt 内に static 注入 (= 現状 SPEC_RUNNER_COMMON_CONTEXT) | 「与えられた前提」、印象薄い、業界慣習に上書きされやすい |
| **Read tool で取得させる** (= 本 request) | 「自分で読んだ事実」、印象強い、業界慣習を打ち消しやすい |

= 同じ規律でも agent が能動的に取得した方が context 内での重みが増す。Anthropic 公式 prompt engineering guide の経験則。

### Self-contained change folder

`specrunner/changes/<slug>/` 配下に agent の作業ファイル一式 (= request.md / design.md / tasks.md / specs/ / 等) が集約されている既存設計と整合。rules.md も change folder にコピーされることで、agent の自然な探索範囲内に規律が存在する。

### Identity priming + Constraint binding

各 agent prompt の冒頭で:
- 「あなたは spec-runner のステップ agent」 = identity 固定
- 「rules.md を注意深く読んで、規律の中で行動」 = 規律ファイルへの行動拘束

= 業界慣習が発動した瞬間に identity が打ち消す心理構造。Claude 4.x で aggressive language (= MUST / CRITICAL) を避けつつ強い role 固定が効く。

## 要件

### 1. `specrunner/rules.md` の新設 (= source of truth)

`specrunner/rules.md` をプロジェクトルート配下に作成し、以下の内容を集約:

- **システム概観**: spec-runner とは何か、pipeline 11 step 構成、独立 session + artifact 経由連携
- **思想原則**: agent は semantic content のみ、path / format / 分類は tool / CLI が決定、観察可能な事実で検証
- **責任範囲**: 各 step の touch 可能 / 禁止領域テーブル (= 現状 SPEC_RUNNER_COMMON_CONTEXT 内のテーブルを移動)
- **System Facts**: ADR / Authority spec / Delta spec / Change folder / Request 等の正規 path 一覧
- **ADR 配置の特記** (= 新規追加、4 件事故対策):
  - ADR の path / ファイル名は **adr-gen 以外の step で記載しない** (= design.md / tasks.md に書かない)
  - 業界慣習 MADR の `docs/adr/NNN-...` 形式は **採用しない** (= project 規約で `specrunner/adr/{YYYY-MM-DD}-{slug}.md` を正規)
  - 他 step が「ADR を作成すべき」と提案する時は **具体 path を指定しない** (= adr-gen に委ねる)
- **Delta spec 記法**: 既存 `DELTA_SPEC_FORMAT` の内容を移動
- **Authority spec lifecycle**: 既存 `AUTHORITY_SPEC_GUARD` の内容を移動

### 2. worktree setup での change folder へのコピー

`src/core/runtime/local.ts:218-220` および `src/core/runtime/managed.ts:114` の worktree setup 処理 (= request.md を change folder にコピーする既存機構) に rules.md コピー処理を追加:

```typescript
// 既存: requests/active/<slug>.md → changes/<slug>/request.md
// 追加: specrunner/rules.md → changes/<slug>/rules.md
```

run 開始時 (= worktree setup) に rules.md が change folder に配置される。

### 3. 各 agent system prompt の冒頭定型句

全 agent の system prompt の **最初の paragraph として** 以下を追加:

```
あなたは spec-runner のステップ agent (= {step name}) です。
rules.md (= `specrunner/changes/<slug>/rules.md`) を注意深く読んで、規律の中で行動してください。
作業開始前に必ず rules.md を Read で読んでから着手してください。
```

対象 agent (= 独自 system prompt ファイルを持つもの):
- design / spec-review / spec-fixer / test-case-gen / implementer / build-fixer / code-review / code-fixer / adr-gen / request-generate / request-review

対象外:
- **delta-spec-validation** (= kind: cli、agent session なし、system prompt 存在しないため適用不可)
- **delta-spec-fixer** (= 独自 prompt ファイルを持たず `SPEC_FIXER_SYSTEM_PROMPT` を流用、`spec-fixer-system.ts` の更新で自動反映される)

### 4. 既存 fragment の整理

`src/prompts/fragments.ts` の以下を rules.md に集約 → fragments.ts から削除:

- `SPEC_RUNNER_COMMON_CONTEXT` (= 全 4 層を rules.md に移動)
- `AUTHORITY_SPEC_GUARD` (= rules.md の「Authority spec lifecycle」セクション)
- `DELTA_SPEC_FORMAT` (= rules.md の「Delta spec 記法」セクション)

残す fragment: `COMMIT_DISCIPLINE` (= 振る舞いの具体ルール、規律ではない)、`PIPELINE_RULES` (= review skill 専用 scoring rule)

`buildSystemPrompt` の強制 prepend ロジックは削除 or 簡素化 (= rules.md 取得が agent 側に移ったため)。

### 5. test 更新

#### 5-1. `fragment-coverage.test.ts`

`tests/unit/prompts/fragment-coverage.test.ts` の対応表を本 request の整理 (= `SPEC_RUNNER_COMMON_CONTEXT` / `AUTHORITY_SPEC_GUARD` / `DELTA_SPEC_FORMAT` 削除) に合わせて update。

#### 5-2. `common-context-catch.test.ts`

`tests/unit/prompts/common-context-catch.test.ts` (= PR #339 prevention test、`SPEC_RUNNER_COMMON_CONTEXT` 注入を前提に prompt 内 path 文字列を assert) は本 request の `buildSystemPrompt` prepend 削除で失敗する。新設計に合わせて以下のいずれかに変更:

- 各 agent prompt が rules.md への Read 指示 (= 「`specrunner/changes/<slug>/rules.md` を Read で読んで」) を含むことを静的 assert
- もしくは rules.md ファイル本文に ADR 配置規律セクションが存在することを assert

両者を組み合わせる方が strict。

### 6. 再現 test (= 静的 unit test、LLM 呼び出しなし)

PR #339 / #343 / #344 同型ケースの構造的 catch を以下の **静的 unit test** で検証 (= LLM integration test は非決定論で CI 不適):

- `tests/unit/rules-md.test.ts` 等を新規作成
- assertion 例:
  - `specrunner/rules.md` が存在し、「ADR 配置の特記」セクションを含む (= 「業界慣習 MADR」「採用しない」「adr-gen 以外で記載しない」等のキーワード含有)
  - rules.md 内に `specrunner/adr/{YYYY-MM-DD}-{slug}.md` の正規 path 文字列が含まれる
  - 全 agent system prompt が「`specrunner/changes/<slug>/rules.md` を ... Read」のような Read 指示を含む (= 文字列 contains で検証)
  - design / code-review / code-fixer prompt が `docs/adr/` への明示的言及を含まない (= 業界慣習を発動させない)

## スコープ外

- **ADR 配置場所自体の仕様変更** (= 既存 `specrunner/adr/{YYYY-MM-DD}-{slug}.md` 維持)
- **post-process rename** (= CLI 側 file system 後処理は別議論)
- **tool 化** (= runtime 偏りで採用不可)
- **session resume + correction** (= managed 限定で採用不可)
- **他 step path 強制への横展開** (= 本 request は ADR / authority / delta の既存範囲のみ)
- **既存 archive 配下の規律記録 retrofit** (= 過去 ADR は touch しない)

## 受け入れ基準

- [ ] `specrunner/rules.md` が新設され、以下のセクションを含む:
  - システム概観 / 思想原則 / 責任範囲 / System Facts / ADR 配置の特記 / Delta spec 記法 / Authority spec lifecycle
- [ ] worktree setup で `specrunner/rules.md` → `specrunner/changes/<slug>/rules.md` のコピーが実行される (= request.md と同じ機構)
- [ ] 全 agent system prompt の冒頭に identity priming + Read 指示の定型句が含まれる (= unit test で検証)
- [ ] `SPEC_RUNNER_COMMON_CONTEXT` / `AUTHORITY_SPEC_GUARD` / `DELTA_SPEC_FORMAT` が `src/prompts/fragments.ts` から削除され、内容は rules.md に集約されている
- [ ] `buildSystemPrompt` の強制 prepend ロジックが整理されている (= rules.md 移行に伴う簡素化)
- [ ] `fragment-coverage.test.ts` の対応表が update され green
- [ ] `common-context-catch.test.ts` が新設計 (= Read 指示 + rules.md 本文) に合わせて update され green
- [ ] PR #339 / #343 / #344 同型ケースの構造的 catch を静的 unit test (= LLM 呼び出しなし、文字列 assert) で検証 (= rules.md セクション存在 + 全 agent prompt の Read 指示 + ADR path 文字列含有)
- [ ] `bun run typecheck && bun run test` が green
- [ ] ADR に「rules.md 集約方式の採用」「change folder コピー + Read 強制の設計」「identity priming + acquired information の心理効果」「業界慣習 MADR 不採用の明示」を記録

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

TBD
