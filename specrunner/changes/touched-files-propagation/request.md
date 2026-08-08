# 先行 step の touched files を後続 step prompt に伝搬する

## Meta

- **type**: new-feature
- **slug**: touched-files-propagation
- **base-branch**: main
- **adr**: false

## 背景

pipeline の後続 step（reviewer / fixer 群）は、先行 step が特定済みの「この request の主役ファイル」を毎回 Grep/Glob で独立に再発見している。直近 2 job の transcript 実測では、この発見探索が job あたり 60〜80 turn を占め、同一ソースファイルが最大 11 セッションで重複読みされていた（例: code-fixer.test.ts）。先行 step が触ったファイル一覧を CLI が記録し、後続 step の prompt にヒントとして注入すれば、この再発見 turn を排除できる。

change folder artifact の同梱（step-prompt-artifact-injection、マージ済み）と補完関係にあり、artifact で救えない「request 固有の登場人物ソース/テストファイル」を対象とする。同一 job 内の伝搬なので注入知識の鮮度リスクはない。

## 現状コードの前提

- src/adapter/claude-code/agent-runner.ts:627,638 — runQuery は SDK message を for await で逐次観測し、`isToolUse(message)` で tool_use を検出している（touched files の記録点として利用可能）
- src/adapter/claude-code/message-types.ts:34-35 — `isToolUse` は `content_block_start` イベントを narrow する。streaming では content_block_start の `input` は部分的（空 `{}`）であり得る
- src/adapter/shared/artifact-bundle.ts — 先行 request で導入された prompt 注入の共有層。buildArtifactBundle は fail-open（空文字で従来 prompt）
- src/adapter/claude-code/agent-runner.ts:462-464 / src/adapter/codex/agent-runner.ts:335-336 — 両 adapter とも baseFullPrompt 組成時に artifactSection を挿入する形が確立している

## 要件

1. claude-code adapter の agent 実行中に、agent が使用した Read / Edit / Write の対象ファイルパスを step 単位で記録する。抽出は **input が完全な形で得られる message 種別**から行うこと（streaming の content_block_start は input が部分的であり得るため、それを根拠にしない）。
2. 記録の正規化: パスは worktree 相対に正規化し、worktree 外のパスと change folder（specrunner/changes/）配下のパスは除外する（後者は artifact 同梱で既知のため）。step 内で重複排除し、1 step あたり最大 100 件で打ち切る。
3. 記録は pipeline の in-memory state 経由で既存の state store に一元化して永続化する。**別 store からの disk 直接追記はしない**（state 丸ごと persist で巻き戻る既知問題を踏まないため）。同一 step の再実行時は最新 run の記録で置き換える。
4. 後続 step の prompt 組み立て時（artifact bundle と同じ共有層）に、先行 step の記録を「step 名 → ファイル一覧」のセクションとして注入する。文言に**「出発点のヒントであり網羅ではない。レビュー・探索の範囲をこの一覧に制限してはならない」**を明記する。記録が空なら注入なし（従来 prompt、fail-open）。
5. 注入セクションの合計サイズに上限（16KB）を設け、超過時は注入を行わない（fail-open、部分注入はしない）。
6. resume 経路で記録が保持されること: state 保存 → resume 読み出しで先行 step の記録が失われず、resume 後の step にも注入されること。
7. codex adapter は記録を行わない(記録が空のため注入もされない)。注入側は共有層経由のため、将来 codex 側で記録を実装すれば追加変更なしで注入される形にする。

## スコープ外

- codex adapter での touched files 記録
- Grep / Glob のパターンや検索結果の記録
- Bash 経由のファイルアクセス（cat 等）の検出
- 効果実測（merge 後に attended で実施）

## 受け入れ基準

- [ ] 記録の unit test: 模擬 message stream から (a) Read/Edit/Write のパスが抽出される (b) worktree 外・change folder 配下が除外される (c) 重複排除される (d) 100 件で打ち切られる
- [ ] 注入の unit test: (a) 先行 step 記録あり → step 名付きセクションと制限禁止の文言が prompt に含まれる (b) 記録なし → 従来 prompt と同一 (c) 16KB 超過 → 注入なし
- [ ] resume 経路の test: state 保存 → 読み出しで記録が保持され、resume 後の step prompt に注入される
- [ ] src/core/step/ 配下の既存 buildMessage テストは無改変で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **記録は state store 一元化**。`.specrunner/local/` 等への別ファイル直接追記は、in-memory 先行の state 丸ごと persist と競合して巻き戻る既知問題があるため却下。
- **change folder 配下のパスは記録から除外**。artifact 同梱（先行 request）で既に prompt に入っており、重複注入はノイズ。
- **ヒントであって範囲制限ではない**。reviewer が implementer の見た場所しか見なくなると implementer の盲点を相続しレビュー独立性が失われるため、注入文言で明示的に禁止する。
- **~/.claude の transcript 解析は採用しない**。外部フォーマット依存になるため、adapter が既に観測している SDK message stream から記録する。
- **codex 記録は今回やらない**。codex の tool 体系は claude-code と異なり抽出マッピングが別物になる。注入側を共有層に置くことで、後続 request が記録側だけ足せば済む形にする。
