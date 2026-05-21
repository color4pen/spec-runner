# `specrunner request show` / `request rm` サブコマンドを削除する

## Meta

- **type**: spec-change
- **slug**: request-show-rm-removal
- **base-branch**: main
- **adr**: false

<!-- adr=false: 単純な機能削除、設計上のトレードオフは存在しない -->

## 背景

`specrunner request show <slug>` / `specrunner request rm <slug>` は drafts 配下の request を表示・削除するサブコマンドだが、以下の理由で廃止が妥当:

| # | 理由 |
|---|---|
| 1 | **使用頻度が低い** — drafts 配下は plain markdown file、`cat` / `rm` で十分 |
| 2 | **CLI surface の肥大化** — request サブコマンドが 8 個 (new/generate/ls/show/rm/template/validate/review) あり整理対象 |
| 3 | **「draft を CLI で削除する」というユースケースが薄い** — draft は人間が編集前提、削除は file system 操作で完結 |
| 4 | **`request show` は `cat specrunner/drafts/<slug>.md` で代替可能** — CLI feature として独立する正当性が薄い |

関連 issue: #355

## 要件

1. `src/core/command/request-show.ts` ファイルを削除する MUST。
2. `src/core/command/request-rm.ts` ファイルを削除する MUST。
3. `src/cli/command-registry.ts:24-25` の `executeShow` / `executeRm as executeRequestRm` の import 文と該当 command 登録を削除する MUST。
4. CLI help 出力 (= `USAGE` 定数等) から `request show` / `request rm` の記載を削除する MUST。
5. 関連 unit test を削除する MUST:
   - `tests/unit/core/command/request-show.test.ts`
   - `tests/unit/core/command/request-rm.test.ts`
6. `tests/unit/cli/help-output-tc.test.ts:29-30` の `expect(USAGE).toContain("request show")` / `expect(USAGE).toContain("request rm")` assertion を `not.toContain` に書き換える MUST (= 不在を assert)。
7. spec `cli-commands` の delta spec に「`request show` Requirement を REMOVED」「`request rm` Requirement を REMOVED」を含める MUST (= baseline `### Requirement: \`specrunner request show <slug>\` は request.md の本文を表示する` および `### Requirement: \`specrunner request rm <slug>\` は drafts 配下から request を削除する` を REMOVED として宣言)。
8. spec `cli-commands` の delta spec で baseline `### Requirement: \`request new\` / \`request show\` / \`request rm\` / \`request validate\` / \`request review\` は slug validation を実行する` (`specrunner/specs/cli-commands/spec.md:551`) を MODIFIED として `request new / request validate / request review` のみに限定する形に書き換える MUST。

## スコープ外

- **他の request サブコマンド整理** (= `request ls` / `request template` 等の整理は別 request)
- **CLI 全体の noun-verb 体系統一** (= 関連 issue #295、本 request の射程外)
- **drafts/ ディレクトリ廃止** (= 別議論)

## 受け入れ基準

- [ ] `specrunner request --help` の出力に `show` / `rm` が含まれない
- [ ] `specrunner request show <slug>` 実行時に unknown subcommand エラーで exit
- [ ] `specrunner request rm <slug>` 実行時に unknown subcommand エラーで exit
- [ ] `git ls-files src/core/command/request-show.ts src/core/command/request-rm.ts` が空である
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

不要 (= 単純な機能削除、設計判断なし)
