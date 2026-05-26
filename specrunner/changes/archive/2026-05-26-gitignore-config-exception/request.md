# .gitignore で .specrunner/ を ignore しつつ config.json を例外として team 共有可能にする

## Meta

- **type**: spec-change
- **slug**: gitignore-config-exception
- **base-branch**: main
- **adr**: true

## 背景

PR #401 (project-config-overlay) で **project local config (`<repo-root>/.specrunner/config.json`)** を user global に deep merge で重ねる仕組みを導入した。これにより project ごとに verify pipeline / step model 等を override 可能になった。

しかし現状の `init` 経由で `.gitignore` に追加されるエントリが **`.specrunner/`** (= directory 全体 ignore) のため、project local config が **git で共有されない** という制約がある:

```
~/.config/specrunner/config.json     → 開発者個人 (= モデル選好)
<repo>/.specrunner/config.json       → project 固有 (= verify、step 強制) … ★ commit されない
```

= **team で同じ project config を共有できない**、各開発者が手動で `.specrunner/config.json` を作成する必要がある。これは「verify pipeline を team で揃える」「重要 step に強制 model を当てる」等の use case でブロッカー。

### 観察: gitignore 例外指定の git の罠

単純な負パターン (= `!.specrunner/config.json`) では効かない。git の仕様で **「親 dir が ignore されると配下の `!` 再 include が無効」**:

```gitignore
.specrunner/                    # ← directory 自体を ignore
!.specrunner/config.json        # ← 効かない (親が ignored)
```

正しい書き方:

```gitignore
.specrunner/*                   # ← 直下の全要素 ignore (= dir 自体は track)
!.specrunner/config.json        # ← 例外、効く
```

### 影響箇所

| 領域 | 状態 |
|---|---|
| `src/util/gitignore.ts` の `ensureDotSpecrunnerGitignore()` | hardcoded で `.specrunner/` を追加、新フォーマットに更新が必要 |
| `tests/unit/util/gitignore.test.ts` (TC-GI-01〜05) | hardcoded 文字列 `.specrunner/` の test、更新必須 |
| 既存 project の `.gitignore` | 既に `.specrunner/` がある project は migration が要る (= idempotent な自動 upgrade) |
| `specrunner init` command 本体 | gitignore 関数の挙動変更だけで足り、command logic 自体は変更不要 |

## 要件

### 1. `ensureDotSpecrunnerGitignore` を新フォーマットに更新

`src/util/gitignore.ts` の `ensureDotSpecrunnerGitignore(repoRoot)` を **2 行構成**を生成・維持するように変更:

```
.specrunner/*
!.specrunner/config.json
```

**idempotent な挙動**:
- 既に 2 行とも存在 → 何もしない
- どちらか不足 → 不足分を追加
- 古い形式 (= `.specrunner/`) が存在 → **新形式に書き換え** (= `.specrunner/` を `.specrunner/*` に置換、`!.specrunner/config.json` を追加)
- 旧形式が複数行存在しても、結果として「`.specrunner/*` 1 行 + `!.specrunner/config.json` 1 行」になっていれば OK

**コメントは保持する** (= 既存 `# Machine-generated specrunner state (jobs, verbose logs)` 等を残す、本要件では新コメント追加は任意で implementer 判断)。

### 2. test 更新

`tests/unit/util/gitignore.test.ts` の既存 TC-GI-01〜05 を新フォーマット (= 2 行構成) に合わせて update + 以下のケースを追加:

- 旧形式 (= `.specrunner/` 単独) が存在する gitignore → 新形式に migrate される
- 既に新形式の 2 行が存在 → 何もしない (= idempotent)
- 部分的にしか存在しない (= `!` 行だけ無い) → 不足分追加
- 複数の `.specrunner/` 行が duplicated → 1 行に統合 (or 既存重複は触らず新形式を確保)

### 3. doc 更新

- `specrunner/project.md` の設定セクションに **「project local config を team で共有する設計」** を 1 段落追加 (= `.specrunner/config.json` のみ commit、`jobs/` `logs/` は ignore)
- `README.md` の「Configuration」セクション (= もしあれば) に同様の note

### 4. 既存 spec-runner repo 自身の `.gitignore` も新形式に migrate

`<repo-root>/.gitignore` の `.specrunner/` 行を本 request の中で `.specrunner/*` + `!.specrunner/config.json` の 2 行に書き換える (= dogfood 整合性、PR merge と同時に effective)。

## スコープ外

- **`specrunner init` で `.specrunner/config.json` のテンプレート生成** — yagni、開発者が手動で書く想定。必要になったら別 request
- **既存 project の自動 migration script** — `ensureDotSpecrunnerGitignore` の idempotent 化で次回 `specrunner init` 実行時に自動 upgrade される、別途 script は不要
- **`.specrunner/credentials.json` 等の secret 系を例外にする話** — credentials は user global (`~/.config/specrunner/credentials.json`) が現状設計、project local の secret は scope 外
- **複数の例外 file (= `config.shared.json`, `config.example.json` 等)** — 1 つの `config.json` のみ例外、追加 file は本 request 対象外
- **Windows gitignore 互換性検証** — POSIX shell 前提、Windows 環境は別軸

## 受け入れ基準

- [ ] `ensureDotSpecrunnerGitignore(repoRoot)` が新規 .gitignore に対して `.specrunner/*` + `!.specrunner/config.json` の 2 行を追加する
- [ ] 既に旧形式 `.specrunner/` のみ存在する .gitignore に対して、新形式 2 行に migrate する (= 旧行を書き換え + 例外行追加)
- [ ] 既に新形式 2 行が存在する場合、何も追加・変更しない (= idempotent)
- [ ] 部分的に存在 (= `.specrunner/*` だけ or `!.specrunner/config.json` だけ) する場合、不足分を追加
- [ ] 既存 `tests/unit/util/gitignore.test.ts` の **TC-GI-01〜06 全件**が新フォーマットで pass する (= TC-GI-06 は `node_modules/\n.specrunner/\n` 等価性を assert しており、新形式実装後は assert 内容も合わせて update する必要あり)
- [ ] 新規 test ケース (= 旧→新 migration / 部分存在 / idempotent) が追加され pass する
- [ ] spec-runner repo 自身の `.gitignore` が新形式に更新されている (= PR diff に含まれる)
- [ ] `<repo-root>/.specrunner/config.json` を作成 → `git status` で **tracked file として認識**される (= dogfood 検証)
- [ ] `<repo-root>/.specrunner/jobs/<jobId>.json` を作成 → `git status` で **ignored** のまま (= 個人作業状態は ignore 維持)
- [ ] `bun run typecheck && bun run test` が green
- [ ] doc 更新: `specrunner/project.md` に team 共有設計の 1 段落、`README.md` の Configuration セクション (= 該当箇所) に note 追加

## architect 評価済みの設計判断

- **`.specrunner/*` + `!.specrunner/config.json` の 2 行構成を採用**: git の仕様 (= 親 dir ignore 配下の `!` 再 include 不可) を回避する標準パターン。シンプル、将来 `.specrunner/` 配下に machine-generated file (= `cache/`, `tmp/` 等) が追加されても自動 ignore
- **`.specrunner/jobs/` `.specrunner/logs/` を明示 ignore する案を採用しない**: 将来 `.specrunner/` 配下に新規 dir が増えるたびに gitignore 更新が必要、保守コスト高。負パターン (= `*` で全 ignore + `!` で例外) のほうが robust
- **既存 `.specrunner/` 単独行は自動 migration**: idempotent 性を保ちつつ、次回 `specrunner init` 実行で開発者は意識せず upgrade される。手動修正の手間を省く
- **config.json 1 つだけ例外**: yagni、複数 file 例外 (= `config.shared.json` 等) は use case が出てから別 request で議論
- **本 request は PR #401 (project-config-overlay) の延長**: 同じ design 系統 (= project local config を team 共有可能にする) で完結する自然なまとまり、lint-mechanical-verification 等の verification 抽象化系統とは別軸
