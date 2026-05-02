## Context

PR #51 で実装した `specrunner finish` は openspec-workflow `request-merge` skill を CLI へ翻訳する形で 2-PR モデル（feature PR merge → archive PR 作成 → archive PR auto-merge）を採用した。dogfooding-006（PR #48 への適用）で 4 件の defect が露呈し、いずれも `state.request.path` への過剰結合 / 中間状態 atomicity 欠落 / pre-flight 検証欠落 / transient state 非対応 という共通の構造的原因を持つ。

現状の主要コンポーネント:

- `src/cli/finish.ts` — finish entry point。jobId / `--slug` / awaiting-merge 走査の 3 段階で対象 job を解決
- `src/core/finish/archive-pr.ts` — chore/archive-<slug> branch 作成、archive PR 作成、auto-merge を担う（**本 change で削除**）
- `src/core/finish/*` — feature PR merge、openspec archive 実行、git mv 操作の orchestrator
- `src/state/schema.ts` — `JobState.request: RequestInfo` に slug field 不在
- `src/agents/.../register_branch` custom tool — branch のみ受領、slug 客体化なし

constraint:

- main への直 push 禁止（branch protection 不変条件）。1-PR モデルでも feature PR merge 経由で main に反映する形は維持
- LLM 呼び出し禁止（finish は pure CLI、deterministic）
- `gh` / `git` / `openspec` バイナリは subprocess spawn で利用（既存パターン継続）
- 既存 state file の後方互換は必須（slug field 無しでも load 成功）
- branch protection の "approval dismissal on new commit" 設定は **採用しない方針**（trade-off として 1-PR モデルを許容）
- fork PR 対応は scope 外

## Goals / Non-Goals

**Goals:**

- `specrunner finish` を deterministic CLI として dogfooding に耐える設計に再構築する
- slug を schema レベルの canonical 情報として固定し、派生情報（`request.path` basename）への依存を排除する
- 1-PR モデルへ転換し、orphan branch / empty PR / 中間非整合状態 / partial failure resume の defect 群を構造的に消す
- irreversible な merge 実行前に reversible 検査を全部済ませる Phase 0 pre-flight を導入する
- adversarial test fixture（legacy `/tmp/...` request.path、transient UNKNOWN、Phase 0 fail、`--dry-run`、`--pr` 逆引き）で実 dogfooding 入力分布を test 化する

**Non-Goals:**

- openspec-workflow 側の改善（propose agent の RENAMED 規約 / spec-reviewer の header consistency / verification phase の openspec validate gate）— 別 request
- fork PR からの finish — 単一 author repo 前提を維持。多人数 contribution は将来課題
- branch protection rule の "approval dismissal on new commit" 設定 — 入れる場合は別 request で再設計
- PR #48 / dogfooding-006 の orphan cleanup — PR #55 で実施済
- `merged` JobStatus 中間状態の導入 — 1-PR モデルでは `success → archived` の 2 段遷移で十分

## Decisions

### D1. slug を `RequestInfo.slug: string | null` field として schema に固定する

`RequestInfo` に `slug: string | null` field を新設し、`request-execute` 起動時に pipeline-context.md の `request-path` から `path.basename` で抽出して populate する。pipeline-context.md が無い legacy state（`/tmp/...` 等の non-canonical path）は `null` を設定する。

**rationale:**
slug を派生情報（`request.path` basename / `state.branch` suffix）から都度計算する設計は、入力の clean さに依存して破綻する（dogfooding-006 で実証済み）。schema field として固定すると新規 state の slug は単一の source of truth を持ち、legacy state のみ fallback path を通る。fallback は `getJobSlug` helper に閉じ込め、業務ロジックが直接派生計算しないようにする。

**alternatives considered:**
- (a) slug を独立した jobs index ファイルに保存 → state file の atomic write 境界を跨ぐため race condition の余地。却下
- (b) request.path の正規化を強化（`/tmp/` 排除）→ legacy state の rewrite が必要、後方互換性が壊れる。却下
- (c) state.branch suffix を canonical 化 → branch 命名規約変更時に脆い。fallback としては採用、canonical としては不採用

### D2. `getJobSlug(state): string` helper で fallback chain を一元化する

```ts
function getJobSlug(state: JobState): string {
  if (state.request.slug) return state.request.slug;
  if (state.branch) {
    const stripped = stripBranchPrefix(state.branch); // feat/|fix/|change/|refactor/|chore/
    if (stripped) return stripped;
  }
  return path.basename(state.request.path);
}
```

**rationale:**
slug を参照する箇所（finish CLI / ps 出力 / register_branch handler / archive 実行）が複数モジュールに散在する。fallback chain を helper に集約することで、新しい source（例: pullRequest.headRefName）を追加する場合の改修箇所が 1 箇所に閉じる。

### D3. 1-PR モデルへ転換し archive 操作を feature branch に commit する

archive 実行を以下の Phase 順で再構成:

```
Phase 0: pre-flight (reversible only)
Phase 1: feature branch 上で archive 操作
  ├─ git checkout <feature-branch>（必要なら fetch + checkout）
  ├─ openspec archive <slug> [--skip-specs 自動判定]
  ├─ git mv awaiting-merge/<slug> merged/<slug>
  └─ git commit "chore: archive <slug>"
Phase 2: git push origin <feature-branch>
Phase 3: gh pr merge <PR> --squash --delete-branch
Phase 4: markJobArchived + git checkout main + pull --ff-only
```

`createArchivePr`、`pushAndCreateArchivePr`、`prepareArchiveBranch`、`checkArchivePrAlreadyMerged` を削除し、`src/core/finish/archive-pr.ts` 自体を削除候補とする。`chore/archive-<slug>` branch は作成しない。

**rationale:**
2-PR モデルが想定する不変条件（main 直 push 禁止 / archive 操作の独立 review）は openspec-workflow が LLM の runtime 判断と人間監視を前提として成立する。deterministic CLI に翻訳すると、transient state（partial archive、orphan branch、archive PR の auto-merge 待ち）を全部事前組み込みする必要があり、設計の adversarial robustness 不足が dogfooding で必ず露呈する。1-PR モデルでは中間状態が物理的に存在しなくなる（archive commit が feature PR の最後の commit として乗るだけ）。orphan branch / empty PR / partial failure resume の defect は構造的に発生不可能になる。

**trade-off:**
branch protection の「approval dismissal on new commit」設定を入れた場合、archive commit 追加で approval が dismiss される。この設定は SpecRunner repo では採用しない方針（別 request で再設計可能性を残す）。fork PR からの finish は対応不可（feature branch への push 権限が無い）。SpecRunner は単一 author 前提なのでスコープ内。

**alternatives considered:**
- (a) 2-PR モデルを維持し adversarial robustness を強化 → 中間状態の組合せ爆発（archive 0/1/2 commit × push 失敗 × archive PR conflict × auto-merge timeout）。設計コストが線形に増える。却下
- (b) main への直 push（branch protection 一時解除）→ 不変条件違反。却下
- (c) archive 操作を別 commit でなく squash merge 時の commit message に含める → openspec archive は filesystem 操作（mv）を伴うため commit を分離せざるを得ない。不採用

### D4. Phase 0 pre-flight で reversible 検査を irreversible op の前に固める

`gh pr merge` は不可逆なので、その前に以下を全部走らせる:

| # | check | fail action |
|---|-------|------------|
| 1 | slug 解決可能（D1/D2） | escalation |
| 2 | `state.pullRequest.number` 存在 | escalation |
| 3 | `gh pr view <num> --json mergeStateStatus,state,headRefName` 成功 + state 取得 | escalation |
| 4 | `mergeStateStatus=UNKNOWN` を 3秒×3回 retry | retry 後も UNKNOWN なら escalation |
| 5 | `openspec/changes/<slug>/` 実存 + delta spec 有無判定 | 不在なら warning（archive skip path 予告） |
| 6 | `openspec validate <slug>` dry-run | fail なら escalation |
| 7 | `gh` `git` `openspec` バイナリ available | fail なら escalation（"doctor を実行してください"） |
| 8 | feature branch の未 push commit 無し | 警告のみ（user 判断で続行） |

`--dry-run` mode は Phase 0 のみ実行して計画を stdout に出す。destructive op は spawn しない（test で assertion）。

**rationale:**
dogfooding-006 では `mergeStateStatus=UNKNOWN` を即 escalation 扱いし、再実行で OPEN_MERGEABLE に正規化された。GitHub の merge state 計算は eventual consistent なので transient retry が必須。`openspec validate` を merge 前に走らせることで delta spec の RENAMED/MODIFIED 不整合（cli-finish-command 2026-05-02 で踏んだ）を irreversible op の前に検出できる。

### D5. `register_branch` custom tool に slug field を追加する

入力 schema:

```ts
{ branch: string, slug?: string }
```

`slug` 未指定時は handler 側で `stripBranchPrefix(branch)` で導出。propose agent の出力を slug 込みに更新するが、既存出力（slug 無し）も後方互換で受け付ける。

**rationale:**
`register_branch` は state.branch の唯一の writer。ここで slug を客体化することで、新規 job は state.request.slug を確実に持つ。propose agent の出力を即時に変えなくても server 側 fallback で動く（移行を段階的にできる）。

### D6. `specrunner ps` 出力に SLUG 列を JOB_ID の次に追加する

```
JOB_ID    SLUG                       STEP        STATUS    BRANCH                        AGE
e1a7658e  readme-status-section      pr-create   archived  feat/readme-status-section    2d
```

slug は `getJobSlug(state)` の戻り値。長い slug は切り捨てない（wrap 許容）。

**rationale:**
ps 出力の主目的は「どの request がどの job に対応するか」の特定。slug が見えないと jobId と request の対応が掴めず、dogfooding loop で人が思考停止する。

## Risks / Trade-offs

**[R1] branch protection の "approval dismissal on new commit" 設定との非互換**
→ SpecRunner repo では当該設定を入れない方針を採用。将来採用するなら別 request で 2-PR モデルへ戻すか、bot の approval を後付けする設計を検討。本 change の scope では受容する。

**[R2] fork PR 対応不可**
→ SpecRunner は単一 author 前提。fork からの contribution は将来課題として残す。エラーメッセージで「fork PR からの finish は未対応です。upstream で実行してください」を表示する明示。

**[R3] 既存 state file の slug 不在による fallback 経路依存**
→ `getJobSlug` の fallback chain（slug → branch suffix → request.path basename）で legacy 互換を維持。test fixture（TC-101, TC-102）で fallback 経路を pin する。次回 persist で slug field が書き込まれるので、active job は 1 step で migrate される。

**[R4] openspec validate の起動時間（〜数百 ms）が Phase 0 に乗る**
→ Phase 0 全体は数秒以内に収束する見込み。merge 失敗で escalation した方が rollback コストより安いので、validate は許容コスト。並列実行で短縮余地あり（タスク内で必要なら最適化）。

**[R5] `openspec archive` が delta spec を main spec に merge する仕様変更を将来行った場合の影響**
→ 現状 `openspec archive` は spec を archive ディレクトリに移すのみ。仕様変更があれば本 change の Phase 1 構造を再評価する必要があるが、現時点では risk として顕在化していない。

**[R6] adversarial test fixture が CI 時間を増やす**
→ TC-101〜TC-110 は unit test レベルで stub 化された state を入力するので 1 ケース < 100ms の見込み。CI 時間への影響は微小。

## Migration Plan

1. 本 change を merge する（feature PR 単独）
2. merge 後、最初の dogfooding ターゲット（PR #48 readme-status-section）に対し新 finish を適用し、1-PR モデルの動作を検証する
3. 既存 active job（slug field 無し）は次回の `JobStateStore.persist` で slug field が書き込まれる。明示的な migration script は不要
4. rollback: 本 change を revert することで 2-PR モデルに戻る。ただし revert 時に既に slug field 入りで persist された state は読めるが意味を持たない（無視される）。stale な archive PR / chore branch を作成する old 経路は復活する点に注意

## Open Questions

- Phase 0 で `openspec validate` が遅い場合の並列化要否 → 実装後にプロファイリングで判断
- `--pr <num>` 逆引きで PR の owner/repo を gh CLI のデフォルト解決に委ねるか、明示引数を要求するか → デフォルト解決で実装し、不便があれば flag 追加

> `markJobArchived` のタイミング: Phase 4 の `git pull --ff-only` 完了後に実行することで確定（spec.md cli-finish-command Requirement で MUST 記述済み）。Phase 4 冒頭での実行は main pull 失敗時の状態乖離リスクがあるため不採用。

## Architecture Decision Record (ADR) 候補

ADR `ADR-{date}-finish-1pr-model.md`（openspec-workflow/adr/ 配下）として残す:

- **title**: finish の 2-PR モデル → 1-PR モデル転換
- **context**: dogfooding-006 で 2-PR orchestration の脆弱性が露呈、openspec-workflow との設計分岐
- **decision**: 1-PR モデル採用、archive を feature branch に commit してから merge
- **consequences**: branch protection の approval dismissal 設定との非互換、fork PR の将来課題、orchestration 複雑度ごとの defect 消滅

ADR の生成は workflow 後段（adr-create skill）で行い、本 propose では design.md にメタ情報のみ残す。
