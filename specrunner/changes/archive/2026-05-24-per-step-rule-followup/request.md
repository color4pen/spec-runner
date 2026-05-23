# step 別 rules ファイルの N 段 follow-up 注入

## Meta

- **type**: new-feature
- **slug**: per-step-rule-followup
- **base-branch**: main
- **adr**: true

## 背景

外部プロジェクトで spec-runner を使う際、project 固有の規約 (コーディング規約、評価観点、ドメイン知識) を agent に注入する経路が不足している。

現状の注入経路は 2 本のみ:
- `RULES_MD_CONTENT` (spec-runner 同梱規律、ハードコード) を change folder にコピーして agent に Read させる
- `project.md` (自由文 1 枚) を 4 step (design / spec-review / implementer / code-review) に inline 注入。fixer 系には届かない

prompt に複数指示を詰めると遵守率が劣化する (Lost-in-the-Middle)。ADR `2026-05-22-intra-step-follow-up-prompt` で design step に導入済みの follow-up turn を活用し、1 turn = 1 関心ごとで N 段 follow-up する機構を追加する。

## 要件

1. **`specrunner/rules/<step-name>/<NN-name>.md` に project 規約を配置する**: project root 直下、全 job 共通。change folder には置かない。ディレクトリ名は `STEP_NAMES` の agent step 名と一致させる。CLI step (verification / pr-create / delta-spec-validation) 配下の rules ファイルは executor が無視する。
2. **中身は完全自由文**: frontmatter なし。CLI は中身を解釈しない。
3. **作業 turn 後にファイルごとに follow turn を投げる**: 1 follow turn = 1 ファイル。数字 prefix 昇順。同一 session 継続。ファイルが 0 個なら何もしない。
4. **spec-runner 同梱規律 (`RULES_MD_CONTENT` + change folder + Read) は現状維持**: 本 request では触らない。
5. **CLI が各 follow turn に付加する wrap 文言は 3 要素に限定**: (a) 修正範囲 = この rule に関連する file のみ修正 / (b) stop 条件 = 違反がなければ変更せず end_turn / (c) 意図解釈 = 書かれた言葉そのままではなく意図を汲んで判断する。3 要素以外の wrap を CLI が追加することは禁止。
6. **port 契約を `followUpPrompts: string[]` に変更**: `AgentRunContext.followUpPrompt?: string` を `followUpPrompts?: string[]` に変更する。
7. **Codex adapter の `CodexThread.id` 型を `string | null` に修正**: `@openai/codex-sdk@0.130.0` の `dist/index.d.ts:203` で `get id(): string | null` と定義されている。
8. **Managed Agent adapter は follow turn skip 時に graceful degradation する**: ADR `2026-05-22` D6 の挙動を N 段に拡張する。
9. **ADR `2026-05-22-intra-step-follow-up-prompt` の D2 を refine する新 ADR を起票**: 「follow プロンプトは 1 本」を「ファイル数で bounded な N 段」に一般化する。
10. **project.md の initial inline 注入は維持する**: follow-up に降格させない。
11. **`AgentStep` interface に新 field は追加しない**: rules ディレクトリの有無で executor が動的判定する。

## スコープ外

- 機械チェック設定 UI (forbidden path / 命名規則) を spec-runner 側に持つこと
- code-review への規約強制
- 評価軸 (weight / threshold) の自然文 → 数値自動解決
- rule ファイルの中身を CLI が解釈・検証すること
- `specrunner rules new` 等の CLI コマンド (別 request `rules-new-command`)
- `specrunner init` の変更
- `specrunner rules ls / show` (GitHub issue #379)
- spec-runner 同梱規律 (`RULES_MD_CONTENT`) の分解・follow-up 化 (現状維持、将来の別 request で検討)

## 受け入れ基準

- [ ] `specrunner/rules/<step>/<NN>.md` を配置すると、対象 step の作業 turn 後にファイルが順に follow turn として投げられる
- [ ] 各 follow turn に 3 要素 wrap 文言が含まれ、それ以外の wrap が含まれない
- [ ] rules ファイルが 1 個以上ある step で follow-up が走り、0 個では走らない
- [ ] 3 adapter で N 段 follow-up が動作する。managed-agent は skip 時 graceful degradation
- [ ] `CodexThread.id` 型が `string | null` に修正される
- [ ] ADR D2 refine の新 ADR が追加される
- [ ] worktree 環境で rules ファイルが解決可能であることを確認する test がある
- [ ] design step の既存 `followUpPrompt` が移行後も `followUpPrompts` の一要素として機能する
- [ ] AbortController が全 follow turn を覆う
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

### D1: 配置

- project 直下 `specrunner/rules/<step>/<NN>.md>`、change folder には置かない
- spec-runner 同梱規律 (`RULES_MD_CONTENT` + change folder + Read) は現状維持。本 request では触らない

### D2: N 段 follow-up

- 1 follow turn = 1 ファイル = 1 関心ごと。同一 session 継続
- ADR `2026-05-22` D2 を refine (supersede ではなく一般化)
- ファイルが 1 個以上あれば回す、0 個なら何もしない。設定フラグなし

### D3: spec-runner 同梱規律は現状維持

- `RULES_MD_CONTENT` / `copyRulesToChangeFolder` / system prompt の Read 指示はそのまま残す
- 将来的に project rules と統合する場合は別 request で扱う

### D4: rule 忘却対策

- N 段の最大リスクは後続 turn で前 turn の制約が巻き戻されること
- wrap 文言の修正範囲要素 (= この rule に関連する file のみ修正) で touch scope を限定して緩和

### D5: 自律性のバランス

- CLI は枠組み (修正範囲 / stop 条件 / 意図解釈の余地) だけ与える
- rule の意図解釈と修正の中身は agent の自律に委ねる
- wrap 文言を 3 要素以外に拡張する変更は新 ADR を必要とする

### D6: モジュール分割

ADR `2026-05-23-executor-commit-push-extraction` と同型の sibling 配置 / free function / dependency object パターン:

- **新規** `src/core/step/rules-resolve.ts` — project の rules ファイル列挙・順序合成。`fsAdapter` injectable
- **新規** `src/core/step/rules-followup-prompts.ts` — wrap 文言付き prompt 列への変換 (pure 関数)
- **拡張** `src/adapter/shared/follow-up.ts` — N 段 driver 追加。turn 送信は adapter callback で受け取る
- **拡張** `src/core/step/executor.ts` — ctx に `followUpPrompts: string[]` を詰めるだけ

### D7: port 契約変更

- `AgentRunContext.followUpPrompt?: string` → `followUpPrompts?: string[]`
- `fsAdapter` は required inject (default fallback を作ると core → node:fs の boundary 違反)

### D8: adapter 互換性

- claude-code: resume で別 query 呼び出し、token cost O(N²) は許容
- codex: `Thread.id` 型修正 (`string | null`)
- managed-agent: multi-turn skip 時 graceful degradation
- AbortController は run() 全体に 1 本

### D9: project.md inline 維持

- review 系が project context を知らないまま review を書き終える事故を避ける
