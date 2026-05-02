## 1. State schema 改修（A 章）

- [x] 1.1 `src/state/schema.ts` の `RequestInfo` interface に `slug: string | null` field を追加する
- [x] 1.2 `src/state/store.ts` の loadJobState に slug field 不在時の `null` 補完ロジックを追加する（state file 自体は書き換えない）
- [x] 1.3 `src/state/job-slug.ts`（新規ファイル）に `getJobSlug(state): string` helper を実装し export する（`slug → branch suffix → request.path basename` の fallback chain）。store.ts の I/O 責務と純粋 helper を分離するため store.ts には置かない
- [x] 1.4 `src/state/job-slug.ts` に `stripBranchPrefix(branch): string` 純関数を実装し export する（`feat/` `fix/` `change/` `refactor/` `chore/` 対応）。getJobSlug と同 module に置くことで prefix strip ロジックを 1 箇所に閉じる
- [x] 1.5 `src/cli/run.ts` の job 起動ロジックで request.md path の親ディレクトリ名を `state.request.slug` に populate する（pipeline-context.md / canonical 配置時のみ。それ以外は null）
- [x] 1.6 既存 state file 後方互換 unit test（slug field 無し → load 成功 → getJobSlug が fallback で正しい slug を返す）を追加する

## 2. CLI input contract 刷新（B 章）

- [x] 2.1 `src/cli/finish.ts` の引数解析を `[<slug>] [--pr <num>] [--job <jobId>] [--dry-run]` に再設計する
- [x] 2.2 第一引数として jobId を直接渡す形を廃止し、`--job` flag のみで受け付ける
- [x] 2.3 引数なしの auto-detect を実装する（cwd の `openspec-workflow/requests/{active,awaiting-merge}/<dir>/` 検知 → main worktree の `awaiting-merge/<dir>/` 単一性検知 → 0/2+ 件で escalation）
- [x] 2.4 `--pr <num>` 逆引きを実装する（`gh pr view <num> --json headRefName` → prefix strip → slug 確定 → listJobStates から検索）
- [x] 2.5 `--job <jobId>` flag の help text に「forensics / debug 用」を明示する
- [x] 2.6 `specrunner finish --help` の usage 文字列を新フラグ構成に更新する
- [x] 2.7 `src/cli/index.ts` の usage 文字列で `finish` の 1 行説明を 1-PR モデル文言に更新する

## 3. 1-PR モデル orchestration（C 章）

- [x] 3.1 `src/core/finish/archive-pr.ts` および `createArchivePr` / `pushAndCreateArchivePr` / `prepareArchiveBranch` / `checkArchivePrAlreadyMerged` を **削除** する
- [x] 3.2 `chore/archive-<slug>` branch を作成する code path を全削除する
- [x] 3.3 Phase 1 を再実装する: `git checkout <feature-branch>`（必要なら fetch + checkout）→ `openspec archive <slug> [--skip-specs]` → `git mv awaiting-merge/<slug> merged/<slug>` → `git commit "chore: archive <slug>"`
- [x] 3.4 Phase 1 の冪等性ロジック（archive folder 不在 → archive skip / awaiting-merge 不在 → mv skip / merged 既存 → mv skip / staged 変更ゼロ → commit skip）を実装する
- [x] 3.5 Phase 2 を実装する: `git push origin <feature-branch>`（push する commit が無ければ skip）
- [x] 3.6 Phase 3 を実装する: `gh pr merge <PR> --squash --delete-branch`。`--admin` flag は spec の条件（mergeStateStatus=BLOCKED かつ required status checks が blocking 要因の場合のみ）に従って条件付きで付与する。CLEAN / MERGEABLE 時は `--admin` なしで実行する
- [x] 3.7 Phase 4 を実装する: `markJobArchived` → `git checkout main` → `git pull --ff-only`。markJobArchived は Phase 4 の最後に呼ぶ
- [x] 3.8 resume 冪等性: feature PR が既に MERGED → Phase 1-3 skip Phase 4 のみ / feature branch 削除済み + PR MERGED → archive 反映済み判定で同様
- [x] 3.9 同一 slug への 2 回目実行で `state.status=archived` 検出 → `Already archived` を出して exit 0

## 4. Phase 0 pre-flight（D 章）

- [x] 4.1 `src/core/finish/preflight.ts`（新規）に Phase 0 検査群を実装する
- [x] 4.2 check 1: slug 解決可能性（B 章のロジック）。失敗で escalation
- [x] 4.3 check 2: `state.pullRequest.number` 存在確認
- [x] 4.4 check 3: `gh pr view <num>` 成功 + state 取得
- [x] 4.5 check 4: `mergeStateStatus=UNKNOWN` の 3 秒×3 回 retry を実装する
- [x] 4.6 check 5: `openspec/changes/<slug>/` 実存 + delta spec 有無判定（不在は warning、escalation せず）
- [x] 4.7 check 6: `openspec validate <slug>` dry-run（change folder 存在時のみ）
- [x] 4.8 check 7: `gh` `git` `openspec` バイナリ available（`which`-相当の検査）
- [x] 4.9 check 8: feature branch の未 push commit 無し（warning のみ）
- [x] 4.10 `--dry-run` mode を実装する: Phase 0 のみ実行、destructive op の subprocess spawn を 0 件にする（test で assertion）
- [x] 4.11 dry-run の stdout フォーマットを実装する（解決された slug + source、PR state、archive 計画、merge 戦略、想定 final state）
- [x] 4.12 escalation 統一フォーマット（失敗 Phase / check 番号 / 検知 state / 推奨人間操作 / 再実行コマンド）を実装する

## 5. ps コマンドの slug 列追加（E 章）

- [x] 5.1 `src/cli/ps.ts` の column header に `SLUG` を `JOB_ID` の次に追加する
- [x] 5.2 各 row の SLUG 列に `getJobSlug(state)` の戻り値を表示する（truncate しない）
- [x] 5.3 非 TTY（TAB 区切り）出力にも SLUG 列を含める
- [x] 5.4 `--all` 指定時に `archived` ジョブも含めて表示する
- [x] 5.5 ps 出力の unit test を新フォーマット（6 列）で更新する

## 6. register_branch custom tool の slug 連動（F 章）

- [x] 6.1 `register_branch` の input_schema に optional な `slug` field を追加する
- [x] 6.2 description を 3 文以上に拡張し、slug の意味と冪等性（last-write-wins）を明記する
- [x] 6.3 handler で slug 受領時に `state.request.slug` を上書きする
- [x] 6.4 handler で slug 省略時、`stripBranchPrefix(branch)` で導出して `state.request.slug` に設定する（strip 不可時は branch そのまま）
- [x] 6.5 handler の戻り値に `slug: <resolved>` を含める
- [x] 6.6 propose agent prompt（または agent definition）を更新し、`register_branch` 呼び出し時に slug も渡すよう指示する
- [x] 6.7 後方互換性 test: slug 省略時の handler が branch から導出できることを assert する

## 7. adversarial test fixture（G 章）

- [x] 7.1 TC-101: `state.request.path = "/tmp/dogfooding-001-request.md"` の legacy state で finish が PR を merge する
- [x] 7.2 TC-102: `request.path` basename と `state.branch` suffix が divergent で、branch 由来 slug を採用する
- [x] 7.3 TC-103: `openspec/changes/<slug>/` 不在で archive skip + commit skip + push skip + markJobArchived 直行
- [x] 7.4 TC-104: `mergeStateStatus=UNKNOWN` を 1 回返した後 `CLEAN` を返す mock で retry 経由 merge 成功
- [x] 7.5 TC-105: Phase 0 で `gh pr view` auth failure → escalation、feature PR merge 実行されず main 不変
- [x] 7.6 TC-106: feature PR が既に MERGED の状態で finish 再実行 → Phase 1-3 skip Phase 4 のみで markJobArchived
- [x] 7.7 TC-107: `openspec validate` dry-run fail → escalation、merge 実行されない
- [x] 7.8 TC-108: `--dry-run` mode で何も commit / push / merge しない（destructive subprocess spawn 0 件 assertion）
- [x] 7.9 TC-109: `--pr 48` で逆引き、headRefName から slug を解決
- [x] 7.10 TC-110: `specrunner ps --all` 出力に SLUG 列が表示され、archived 状態の job が含まれる
- [x] 7.11 既存 TC-001〜TC-064 のうち 2-PR モデル前提のもの（archive PR 作成 / chore branch 操作 / 双方の merge orchestration）を削除する
- [x] 7.12 全 test スイート pass を維持する（`bun test` または npm test）

## 8. ADR と request 後始末（H 章）

- [x] 8.1 `openspec-workflow/adr/ADR-{date}-finish-1pr-model.md` を生成する（adr-create skill 経由）
  - title: "finish の 2-PR モデル → 1-PR モデル転換"
  - context: dogfooding-006 で 2-PR orchestration の脆弱性が露呈
  - decision: 1-PR モデル採用、archive を feature branch に commit してから merge
  - consequences: branch protection の approval dismissal 設定との非互換、fork PR の将来課題、orchestration 複雑度ごとの defect 消滅
- [ ] 8.2 `openspec validate finish-redesign --strict` が通ることを最終確認する
- [ ] 8.3 type-check / lint / test の全フェーズ pass を確認する（verification skill）
- [ ] 8.4 PR 作成前に request.md / proposal.md / design.md / specs / tasks.md の整合性を最終 review する
