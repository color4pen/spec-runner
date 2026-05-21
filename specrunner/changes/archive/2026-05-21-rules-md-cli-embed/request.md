# `specrunner/rules.md` を CLI 内部に embed し、project repo の human-editable file から脱却する

## Meta

- **type**: spec-change
- **slug**: rules-md-cli-embed
- **base-branch**: main
- **adr**: true

<!-- adr: rules.md の source of truth を file から code に移す = 振る舞い/契約の structural な変更、ADR 対象 -->

## 背景

現状 `specrunner/rules.md` は spec-runner repo 直下に human-editable file として置かれ、pipeline 実行時に `copyRulesToChangeFolder` が `fs.cp` で change folder にコピーする (= `src/util/copy-artifacts.ts:29`)。

この構造には以下 3 問題がある:

| # | 問題 | 影響 |
|---|---|---|
| 1 | project owner が `specrunner/rules.md` を勝手に編集できる | spec-runner CLI が想定する規律が project ごとに drift |
| 2 | CLI version up と rules.md が乖離 | 古い rules.md が残ったまま新 CLI を使うと、agent prompt と規律が不整合 |
| 3 | rules.md は **spec-runner CLI 本体の責務** (= 全 agent に注入する標準規律) なのに、project repo の file として持つのは責務分離違反 |

= source of truth は CLI コードに置くべき。

## 要件

1. `src/prompts/rules.ts` (新規) に rules 本文を string export として配置する MUST。
2. `src/util/copy-artifacts.ts` の `copyRulesToChangeFolder` を「`fs.cp` from disk」から「string constant → `fs.writeFile` to change folder」に変更する MUST。
3. `src/util/paths.ts` の `rulesSourcePath` を不要化し export を削除する MUST。`rulesDestPath` は残す MUST。
4. `specrunner/rules.md` ファイル自体を削除する MUST (= source of truth は CLI コードに一本化)。
5. `tests/unit/rules-md.test.ts` の disk read 前提を string constant 参照に書き換える MUST。
6. `tests/unit/core/runtime/local.test.ts` の rules.md 関連 test を新方式に追従する MUST:
   - `TC-LR-014` (L590〜): copy test を新方式 (= string → writeFile) に追従
   - `TC-LR-017` (L634〜): `specrunner/rules.md not found` 警告 assertion を削除 (= string constant 前提では ENOENT 経路が unreachable となるため test 自体を削除)
7. spec `prompt-fragment-registry` の delta spec に baseline `### Requirement: rules.md の存在と構造的保証` (`specrunner/specs/prompt-fragment-registry/spec.md:102`) を MODIFIED として更新し、「rules.md content の source of truth は CLI 内部 string constant、change folder への配置は CLI が writeFile で行う」旨に書き換える MUST。

## スコープ外

- **project 固有 rules 注入機構** (= consumer project ごとに rules.md を上書き/追加する mechanism は本 request の対象外、将来 issue として別途検討)
- **rules 本文の内容変更** (= 単に source of truth を移すのみ、文言は現状の `specrunner/rules.md` をそのまま embed)
- **rules customization CLI** (= `specrunner rules edit` 等の feature は本 request の対象外)

## 受け入れ基準

- [ ] `specrunner/rules.md` ファイルが repo から削除されている
- [ ] `bun ./bin/specrunner.ts run` を実行すると change folder に rules.md が writeFile される (= 既存 copy 経路と互換動作)
- [ ] `src/prompts/rules.ts` が source of truth として export を持ち、他ファイルから参照可能
- [ ] `git ls-files specrunner/rules.md` が空である (= repo に追跡されていない)
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

TBD (= design step で決定: rules 本文を template literal / 外部 file `as string` import / 別途 build step 経由 const 化、のいずれを選ぶか)
