# 設計レイヤ CLI（aozu）の受け口を結線する — request 引用の入口ゲートと取り込み完了の出口 hook

## Meta

- **type**: new-feature
- **slug**: aozu-integration-gates
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->
<!-- 外部 CLI への新しい結線（port）と config セクションの追加、出口 hook の配置という設計選択を伴うため true -->

## 背景

設計レイヤ CLI **aozu** は、プロダクトリポジトリ内の `design/` 配下の設計文書を正本として管理する決定的ツールであり、実装パイプラインとの交換面契約（aozu リポジトリ `spec/integration.md`、交換面契約 v0）を公開している。契約 §5 は呼び出し側の推奨結線として「request 検証 step で `check --request`、取り込み完了 hook で `mark implemented`」を示すが、spec-runner にはこの受け口が無く、request 中の設計要素引用の検証と、merge 後の設計要素の implemented 遷移が人手のままである。

ロードマップ草稿（`roadmap-draft-2026-07-02.md` D-2「設計レイヤとの接続」、`improvement-backlog-2026-07-02.md` D-2）はこの結線を「上流ツールの成熟が前提」として据え置いていた。上流側は契約 v0 と対象動詞（`check --request` / `mark implemented`）が実装済みで、前提は満たされた。

呼び出しに必要な契約の要点:

- `aozu check --request <path>` — request 本文中のすべての `[[id]]` 引用（例: `[[mod-intake]]` / `[[ent-order]]`）を抽出し、実在解決と状態（designed | requested であること）を検証する。`--require-citation` で引用 0 件を不合格にできる（付与するかは呼び出し側の判断）。診断は stderr に 1 行 1 診断 `<LEVEL> <CODE> <id> <message>`。exit 0 = 合格 / 1 = 不合格 / 2 = 入力不正（ファイル不存在・`design/` 不在）
- `aozu mark implemented --request <slug> [--pr <番号>]` — 設計側 state.json 中で `request` が `<slug>` に一致する requested 要素をすべて implemented へ遷移する。冪等（再実行 no-op、全遷移 or 全不変）。exit 0 = 遷移完了（no-op 含む）/ 1 = 未知の slug / 2 = 入力不正
- 消費者側の唯一の前提は「request 文書が本文中の `[[id]]` 引用を受け入れること」

## 現状コードの前提

<!-- 書く直前に grep で再検証する。 -->

- src/core/preflight.ts:100 — `run` 起動時の fail-fast で `parseRequestMd(requestMdPath)` を実行する。入口ゲートを足す文脈はここ（preflight は既に async I/O を行っている）
- src/core/command/request.ts:95 — `executeValidate()`（`specrunner request validate` CLI）。preflight と同じ request 検証のもう一つの入口
- src/core/command/request.ts:16 — `buildScaffoldTemplate()`（`request template` / `request new` の雛形生成）。request.md の現行セクションは Meta / 背景 / 現状コードの前提 / 要件 / スコープ外 / 受け入れ基準 / architect 評価済みの設計判断で、設計要素引用の置き場は無い
- src/core/archive/orchestrator.ts — ヘッダに設計不変条件「base ブランチへ checkout / commit / push しない。archive コミットは feature ブランチに記録し remote feature ブランチへ push する」が明記されている。base への反映は既存の squash merge が担う
- src/core/archive/merge-then-archive.ts:471 — `mergePullRequest(..., squash)`、:520 に merge 成功ログ、:525 で `runPostMergeCleanup`。PR 番号は job state の `state.pullRequest.number`（同ファイル :142）から得られる
- src/config/store.ts:95 — プロジェクト config は `<repoRoot>/.specrunner/config.json`（user global との deep merge）。schema は src/config/schema.ts。設計レイヤ関連のセクションは存在しない
- src/core/doctor/checks/runtime/codex-cli.ts — 外部 CLI presence 検証の既存パターン（`execFile` で presence 確認、条件付き required、install ヒント返却）。登録は src/core/doctor/checks/index.ts
- 汎用の post-merge hook / 任意コマンド差し込み機構は存在しない（verification.commands は verification step 限定）
- 実行時依存は極小（dependencies は @anthropic-ai/sdk のみ）。外部ツールは npm 依存でなく CLI spawn で結合する規律

## 要件

<!-- 実装の最重量部を名指しする。 -->

1. **入口ゲート**: 結線が有効なとき、request 検証で `aozu check --request <path>` を spawn し、exit 0 以外を不合格とする。aozu の stderr 診断は利用者向け出力へそのまま透過する。ゲート実装は一つのモジュールに置き、`run` の preflight（parseRequestMd 直後）と `request validate` の両方から呼ぶ（二重実装しない）。config で列挙された request type には `--require-citation` を付与する
2. **出口 hook（最重量部）**: archive フェーズ（feature ブランチ上に archive コミットを記録する時点）で、worktree 内で `aozu mark implemented --request <slug> --pr <PR 番号>` を実行し、生じた設計側 state ファイルの変更を feature ブランチのコミットに含めて push する。base への反映は既存の squash merge に相乗りさせる（base 直コミット禁止の不変条件を守る。base から見た遷移はちょうど merge 時点で起きる）。exit 1（未知の slug = aozu 管理下にない request）は警告に留めて archive を継続する。exit 2（入力不正）は設定不整合として失敗させる
3. **config**: プロジェクト config（.specrunner/config.json）に opt-in の設計レイヤ結線セクションを追加する。既定は無効。コマンド名は注入可能（既定 `"aozu"`）、`--require-citation` を付ける request type の列挙を持つ。無効時は aozu を一切 spawn せず、既存挙動を完全に保つ
4. **doctor**: 結線が有効なとき `aozu` CLI の presence を検証する check を追加する（codex-cli.ts のパターンを踏襲し、checks/index.ts に登録）
5. **request テンプレの引用欄**: `buildScaffoldTemplate()` に設計要素引用のセクション（任意。設計レイヤ導入プロジェクトで、この request が実装する設計要素の `[[id]]` を書く場所と規約コメント）を追加し、request 生成プロンプト（src/prompts/request-generate-system.ts）と docs/request-authoring.md を整合させる。aozu は本文全体から引用を抽出するため、parser（src/parser/request-md.ts）での専用抽出は要しない
6. **テストの独立性**: テストは aozu 実物に依存せず、契約（exit code / stderr 書式）を模した fake 実行体で固定する

## スコープ外

- パイプライン起点 topic の排出（レビューの構造指摘・スコープ外 finding を設計側 `topics/` に落とす結線）。aozu 側交換面契約への追補が前提のため別 request とする
- CI への `aozu check` / `export rules --verify` の結線（消費者リポジトリの CI 設定・verification.commands の領分）
- ruleset（`export rules`）の消費側（architecture test）の実装
- 汎用 post-merge hook / 任意コマンド差し込み機構の新設（本件は設計レイヤ結線に限定した固定結線とし、汎用化は第二の需要が現れてから）
- aozu 本体の変更

## 受け入れ基準

<!-- 機械検証できる文にする。 -->

- [ ] config 無効（既定）のとき aozu が一切 spawn されず、既存挙動が不変であることをテストで固定する（既存テスト無変更で green）
- [ ] 有効時、引用が解決しない request（fake aozu が exit 1 + stderr 診断）で `request validate` と `run` の preflight が不合格になり、aozu の診断が出力に含まれることをテストで固定する
- [ ] 有効時、合格 request（fake aozu が exit 0）で従来どおり進行することをテストで固定する
- [ ] config に列挙した request type で `--require-citation` が付与され、非列挙 type では付与されないことをテストで固定する
- [ ] archive 経路で `mark implemented --request <slug> --pr <n>` が worktree 内で実行され、fake が書いた state ファイル変更が feature ブランチのコミットに含まれることをテストで固定する
- [ ] mark の exit 1 が archive を失敗させず警告になること、exit 2 が失敗になることをテストで固定する
- [ ] doctor が結線有効かつ aozu CLI 不在を検出することをテストで固定する
- [ ] `request template` の出力に設計要素引用セクションが含まれることを固定する（テンプレ系スナップショットの更新を含む）
- [ ] 既存テスト無変更で green / `typecheck` green / `lint` green / `build` 成功

## architect 評価済みの設計判断

- **出口 hook は archive フェーズ・feature ブランチに置く**。却下した代替: (a) merge 成功後に base へ直接コミット — orchestrator の設計不変条件（base へ commit/push しない）に違反する。(b) state 変更だけの追い PR — request 1 件ごとに PR が 2 本になり重く、設計状態の収束も遅れる。採用案は archive コミットと同じ配達経路（feature ブランチ → squash merge）に相乗りするため新しい配達機構を持たず、merge が失敗すれば遷移も base に届かない（fail-safe）。mark implemented の冪等性により archive の再実行にも安全
- **入口ゲートは決定的 CLI への委譲とし、request-review（LLM step）に引用検証を足さない**。却下した代替: request-review プロンプトへの検査項目追加 — 非決定的で、契約の exit code / 診断書式による機械的合否が得られない
- **aozu は npm 依存にせず、config で注入されたコマンド名を spawn する**。dependencies 極小の規律に整合し、spec-runner は契約（CLI 署名と exit code）以外に aozu の内部を知らない
- **mark の exit 1（未知の slug）は警告に留める**。設計レイヤ管理下にない request（通常の bug-fix 等）が正常系として存在するため。設計状態の乖離が起きた場合も aozu 側の status のフロンティア表示で観測可能であり、冪等な mark の再実行で回復できる
