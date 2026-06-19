# ADR-20260620: カスタムレビュワーの並列実行 + per-reviewer status tracking + invalidation（Phase 1）

**Date**: 2026-06-20
**Status**: accepted

## Context

ADR-20260611 が確立した直列 reviewer チェーン（`["code-review", ...customNames]`）では、各 reviewer が
宣言順に実行される。reviewer が複数あると review（実測 5〜8 分）と fix（3〜8 分）が reviewer 数だけ積み上がり
wall-clock が線形に増大する。

各 reviewer は独立した収束ループ（review → needs-fix → code-fixer → approved）を持ち、review は読み取り専用の
独立操作なので論理的には並列化できる。一方で code-fixer は共用のため、複数 reviewer が独立に fixer を呼ぶと
同じファイルを別方向に修正しうる。

本変更（Phase 1）が並列化の前に解決しなければならなかった核心制約:

1. **git index 競合**: 同一 worktree で `git add/commit` を並行実行すると `index.lock` 競合で失敗する。
2. **state 書き込み競合**: `StepExecutor.execute` が実行中に複数回 `store.persist` する。並行実行では
   last-write-wins で中間 persist が失われうる。
3. **active reviewer 概念の崩壊**: 並列完了では「最後に走った reviewer」が定義できない。`resolveActiveReviewer`
   は `startedAt` 最新で active を判定する直列前提の設計（ADR-20260611 D4）であり、並列で破綻する。
4. **per-reviewer status の欠如**: `StepRun[]` の最後の verdict から reviewer 状態を推論する方式は、複数 reviewer が
   同時完了すると active が定義不能になる。resume / invalidation に必要な各 reviewer の現在状態を集約的に持つ
   仕組みがなかった（`JobState.reviewers` は snapshot のみ）。

## Decision

### D1: per-reviewer status を `JobState.reviewerStatuses` として state に持つ

`StepRun[]` からの推論を廃し、集約的な status record を別途導入する。

```
ReviewerStatus {
  name: string;
  status: "pending" | "approved" | "skipped";
  approvedAtCommit?: string | null;    // 承認時の HEAD SHA（invalidation 起点）
  activationPaths?: string[];          // snapshot.paths のコピー（invalidation 照合用）
  invalidatedByCommit?: string | null; // fixer により pending に戻された時の HEAD SHA
}
JobState.reviewerStatuses?: ReviewerStatus[];  // backward compat: 不在 OK
```

`ReviewerStatus` は `src/kernel/reviewer-snapshot.ts` に置く（state→kernel の import 方向を守る）。
`reviewerStatuses` は top-level フィールドなので `stateToStateJson` の spread で state.json に自動 round-trip し、
event-journal threading は不要（`reviewers` / `decisions` と同型）。`reviewerStatuses` 不在の既存 state は
coordinator 入口で全 member を `pending` として初期化する（後方互換）。

- **Alternatives considered**:
  - (A) StepRun の最新 verdict から status を導出 → 並列完了で active が定義不能、resume skip も導出不能。
  - (B) reviewers snapshot に status を可変フィールドとして混ぜる → snapshot は「job 開始時固定」の不変物であるべき。
    可変 status は別レコードに分離する。

### D2: 並列 review は custom reviewer 非空時のみ合成される仮想 coordinator ノードで表現する

`composeReviewerDescriptor` が custom reviewer を 1 件以上検出したときだけ、code-review と conformance の間に
**仮想 coordinator ノード `custom-reviewers`** を持つ並列 review 構造を合成する。reviewer ゼロでは
既存の早期 return（base を参照同一で返す）をそのまま通り、coordinator は pipeline に現れない。
`STANDARD_TRANSITIONS` / `FAST_TRANSITIONS` と `buildReviewerChainTransitions(["code-review"])` は一切変更しない。

合成後の遷移:

- `code-review approved`(clean) → `custom-reviewers`
- `custom-reviewers approved` → `regression-gate`
- `custom-reviewers needs-fix` → `code-fixer`
- `regression-gate` / `code-fixer` の遷移は従来どおり（D9）

descriptor に `parallelReview?: { coordinator: string; members: string[] }` を足し、engine に fan-out 対象を
宣言的に伝える。

- **Alternatives considered**:
  - (A) STANDARD_DESCRIPTOR に常設し runtime で並列/直列を分岐 → zero-config parity が崩れ遷移表が変わる。
  - (B) 専用 pipeline id を新設 → 既存合成と二重管理。

### D3: 並列実行は engine が `StepExecutor.execute` を member ごとに `Promise.allSettled` で同時呼び出しする

`Pipeline.runInternal` で `currentStep === parallelReview.coordinator` を検出したら:

1. `reviewerStatuses` から pending member を決定する（D6 の invalidation を入口で適用）。
2. pending member ごとに `this.executor.execute(memberStep, baseState, deps)` を `Promise.allSettled` で同時実行する。
3. 各 member の返す state を `mergeParallelReviewerStates(base, results)` で in-memory に merge する
   （member の step key は互いに disjoint なので merge は well-defined）。
4. status 更新（D5）+ synthetic coordinator StepRun 記録（D4）+ aggregate verdict 算出（D5）。
5. merge した state を 1 回 authoritative に persist する。

executor 側の唯一の改修は **commit serialization**: instance レベルの promise-chain mutex で
`finalizeStepArtifacts`（= commit/push）呼び出しを直列化する。review セッション本体・read-only git・
`prepareStepArtifacts`（member 固有 file への write）・verdict 導出は並行のままでよい。

- **Alternatives considered**:
  - (A) coordinator を CliStep にして内部で runner を直接駆動 → executor ライフサイクルを丸ごと再実装することになり
    patchwork。judge 契約の二重系統化リスク。
  - (B) finalizeStep を「session 実行」と「commit」に二相分解して batch 末尾で 1 回 commit → 改修面が広く既存
    single-step 経路にも波及する。commit mutex の方が改修が小さく安全。
  - (C) worktree を reviewer ごとに分離して完全独立実行 → 200-500ms setup + disk/agent のコスト、conflict 解消が必要。

### D4: coordinator を loop step として扱い、各ラウンドの aggregate verdict を synthetic StepRun に記録する

coordinator は steps map に実体を持たないが、`loopNames` / `loopFixerPairs[coordinator]=code-fixer` /
`maxIterationsByStep[coordinator]` / `roles[coordinator]={role:"gate",phase:"impl"}` に登録する。
各並列ラウンド完了時に engine が coordinator 名で **synthetic StepRun**（`sessionId: null`）を push する。

これにより:
- `getStepOutcome(coordinator)` が最新 synthetic verdict を返し、遷移表ルックアップが自然に成立する。
- 既存の per-step exhaustion / episode-reset 機構が coordinator を「paired fixer を持つ loop step」として扱える。
- `resolveActiveReviewer` は exhaustion **attribution** 用にはそのまま機能する（D7 参照）。

coordinator の round 予算は `maxIterationsByStep[coordinator] = max(member.maxIterations)` を初期値とする。

- **Alternatives considered**:
  - (A) coordinator を loop 機構の外に置き独自の round counter を持つ → exhaustion / resume 機構を二重化。
  - (B) 代表 member 1 件を loop step に流用 → どの member が代表かが並列で定義不能。

### D5: aggregate verdict 規則と code-fixer への findings 集約

並列ラウンド完了後の集約規則:

- いずれかの member が `escalation` → aggregate = `escalation`
- escalation がなく、いずれかの member が `needs-fix` → aggregate = `needs-fix` → code-fixer
- 全 member が `approved`（または skipped）→ aggregate = `approved` → regression-gate。fixer は **skip**

code-fixer は composed path（`state.reviewers?.length > 0`）で `resolveActiveReviewer` を使わず、
**needs-fix の全 member の最新 findings を集約**（`collectParallelFixerFindings` + `dedupeFindings`）して
1 回のセッションに渡す。standard path（reviewers 空）は `resolveActiveReviewer([code-review])` のまま不変。

### D6: invalidation は approvedAtCommit からの git diff × activationPaths で行う

coordinator 入口（fixer から戻った再入時）で、`status === "approved"` の各 member について:

- `touched = listChangedFiles(member.approvedAtCommit, cwd, branch)` を取得する（既存 seam を再利用）。
- `evaluateActivation({ paths: member.activationPaths }, { changedFiles: touched, requestType })` が
  `activated: true` なら当該 member を `pending` に戻す（invalidatedByCommit = 現 HEAD）。
- `activationPaths` 未定義の reviewer（always-activate）は touched が空でも常に pending に戻す。

pending に戻った member だけが当該ラウンドで再 review される。activationPaths 外のみ変更された member は
approved のまま再 review されない。

- **Alternatives considered**:
  - (A) fixer 直前 HEAD を別途記録して差分を取る → 各 member の承認時点が異なるラウンドをまたぐと不正確。
    approvedAtCommit 起点なら per-reviewer に正しい。
  - (B) fixer が触れたファイルを agent 申告に頼る → observable でなく信頼できない。git diff が真実。

### D7: code-fixer の戻り先を `resolveActiveReviewer` から決定的 predicate に置き換える（composed path のみ）

並列実行では「最後に走った reviewer」が定義できないため、composed path の code-fixer 戻り先解決を
`resolveActiveReviewer` ベースから **優先順位付き `when` predicate** に置き換える。
新しい遷移 builder `buildParallelReviewerTransitions` を `reviewer-chain.ts` に追加する。code-fixer の戻り先（優先順）:

1. `conformanceFixInProgress(state)` → `conformance`
2. `regressionGateActive(state)` → `regression-gate`
3. `codeReviewLoopActive(state)` → `code-review`（coordinator が未稼働 かつ code-review 最新が needs-fix）
4. （default）→ `custom-reviewers`

`resolveActiveReviewer` 自体は削除せず、standard path と exhaustion attribution（D4）でのみ使い続ける。

- **Alternatives considered**:
  - (A) state に「fixer origin」可変フラグを足す → state 表面が増え、history からの再構成より脆い。
  - (B) coordinator 専用 fixer を新設 → 収束ループの組み合わせ爆発（ADR-20260611 Alt-C と同根）。

### D8: resume skip は reviewerStatuses 駆動の pending 選択から自然導出する

coordinator は入口で `reviewerStatuses` を読み、`approved` かつ未 invalidate の member を pending 集合から
除外する。resume 時は persist 済みの `reviewerStatuses` がそのまま読まれるため、特別な resume 分岐は不要。
通常実行・invalidation・resume が同一コードパスに収束する。

### D9: regression-gate / 累積 findings 台帳は不変

regression-gate は全 reviewer approved 後に従来どおり走る。`collectFindingsLedger(state, deriveImplReviewerChain(state))`
は reviewer chain（`["code-review", ...member names]`）の全 run から findings を集約する。coordinator は
member 名と別名（`custom-reviewers`）で chain に含まれないため、台帳は member の実 findings をそのまま集約でき
**変更不要**（ADR-20260612 と完全一致）。

## Alternatives Considered

### Alt-A: 完全並列 fix（各 reviewer が独立に code-fixer を呼ぶ）

review だけでなく fix フェーズも reviewer ごとに独立実行し、reviewer → fixer → reviewer の収束ループを完全並列化する案。

- **Pros**: 各 reviewer が自分の findings だけを fixer に渡すため context が明確。他の reviewer の修正を待たず即座に収束できる可能性がある。
- **Cons**: 同じファイルを別方向に修正しうる（reviewer A が `auth/login.ts` を「型安全化」、reviewer B が同ファイルを「ログ追加」する等）。conflict 解消が必要になる。worktree 分離は重く（200-500ms setup + disk/agent）、managed runtime での対応コストが高い。regression gate との整合も複雑になる（どの fixer run の findings を台帳に使うか）。
- **Why not**: findings を集約して 1 回の code-fixer セッションに渡す方式の方がシンプルで、同一ファイルの相反修正を構造的に防げる。regression gate（全台帳照合）とも整合する。architect 評価済みの却下決定（request.md「完全並列 fix（却下）」）。

### Alt-B: StepRun の最新 verdict から per-reviewer status を推論する（D1 の不採用案）

新規 state フィールドを追加せず、既存の `StepRun[]` の最新エントリから各 reviewer の状態を導出する。

- **Pros**: 新規 state フィールドが不要。既存の StepRun 構造をそのまま使える。
- **Cons**: 並列完了では複数 reviewer が同時に StepRun を追記するため「最後に走った reviewer」が定義できず、active が一意に特定できない。resume 時の skip 判定（approved かつ未 invalidate の reviewer を特定する）も StepRun からは導出不能になる。invalidation の起点（approvedAtCommit）も StepRun からは一意に取れない。
- **Why not**: 集約的な status record（`reviewerStatuses`）を別途持つことで、resume / invalidation / 将来の scheduler 拡張のいずれも O(1) で参照できる。StepRun からの推論は並列で壊れ、推論ロジックが複数箇所に散る。

### Alt-C: `finalizeStep` を「session 実行」と「commit」の二相に分解し、batch 末尾で 1 回 commit する（D3 の不採用案）

`StepExecutor.execute` を session フェーズと commit フェーズに分割し、並列 review の全セッション完了後に 1 回だけ commit/push を実行する。

- **Pros**: `index.lock` 競合が根本解消される。commit 頻度が削減される。
- **Cons**: 既存の `StepExecutor.execute`（1 セッション/1 ステップの前提）を二相に分解する改修面が広く、single-step 経路（code-review・conformance 等）にも波及する。commit のタイミングが変わることで既存の lineage 記録・push タイミングの意味論が変わる。
- **Why not**: executor instance の promise-chain mutex で `finalizeStepArtifacts` 呼び出しだけを直列化する方が改修が小さく安全。session 実行（重い部分）は並行のままにでき、既存 single-step 経路に影響しない。

### Alt-D: worktree を reviewer ごとに分離して完全独立実行する（D3 の不採用案）

reviewer ごとに独立した git worktree を作成し、完全に隔離された環境で並列 review を実行する。

- **Pros**: git index 競合が根本解消される。state 書き込み競合もなくなる。各 reviewer の環境が完全に独立する。
- **Cons**: worktree 作成に 200-500ms setup + disk/agent のコストがかかる。並列 fix（Alt-A）と組み合わせると worktree 間の conflict 解消が必要になる。managed runtime での対応コストが高い。review フェーズは読み取り専用なので worktree 分離の利得が少ない。
- **Why not**: review は読み取り専用の独立操作なので commit mutex による直列化で十分。worktree 分離のコストと複雑度が利得に見合わない（architect 評価済み）。

### Alt-E: resume 専用の skip 判定ロジックを別途持つ（D8 の不採用案）

`ResumeCommand` または pipeline の resume 分岐内に「approved reviewer を skip する」専用ロジックを実装する。

- **Pros**: resume の意図が明示的に表現できる。通常実行と resume の経路が分離されて読みやすい。
- **Cons**: 通常実行の `reviewerStatuses` による pending 選択ロジックと二重系統になり、実装が drift するリスクがある。resume 特有の分岐が増えて状態管理が複雑になる。
- **Why not**: coordinator 入口で `reviewerStatuses` を読んで pending member を選択するロジックは、通常実行・invalidation・resume で全て同一。resume 時は persist 済みの `reviewerStatuses` がそのまま読まれるため特別分岐は不要で、同一コードパスに収束する（D8）。

## Risks / Trade-offs

- **並行 commit の `index.lock` 競合** → D3 の commit mutex（executor instance の promise-chain）で
  `finalizeStepArtifacts` を直列化する。
- **先行 member の commit で後続 member の `headBeforeStep` が古くなる** → 後続 member は自分の result file を
  staged に持つため通常 commit される。先行 member の `git add -A` が後続の result file を巻き込んで先に
  commit した場合も、後続は「staged 無し + head 進行」で push のみ（データロス無し）。
- **並行実行中の中間 `store.persist` が last-write-wins で競合** → engine の最終 merge persist が authoritative。
  atomic-write（temp+rename）なので torn file は出ない。並列ウィンドウ中のクラッシュは resume 時に
  `reviewerStatuses` から冪等回復する。Phase 1 の許容トレードオフとして明記する。
- **managed runtime で並列 / invalidation が機能しない** → `listChangedFiles` が `[]` のため activation /
  invalidation が fail-safe（再 review しない）になる。custom reviewer の managed 非対応は既存の既知制約。
- **always-activate reviewer が managed runtime で fixer 後に常に pending に戻る** → touchedFiles=[] でも
  activationPaths 未定義 reviewer は pending に戻る。managed 非対応の既知制約として整合（Non-Goal）。

## Consequences

### Positive

- custom reviewer が 2 件以上の job で review フェーズの wall-clock が直列時より短縮される（理論値: 1/N）。
- per-reviewer status が state に永続化されることで、resume 後の不要な再実行・invalidation の精度が向上する。
- `resolveActiveReviewer` の「recency 推論」を決定的 predicate に置き換えることで、並列完了でも一意にルートできる。
- coordinator を loop step として既存の exhaustion / episode-reset 機構に乗せることで、新規の収束管理ロジックを追加しない。
- `STANDARD_DESCRIPTOR` が byte-identical に保たれ、zero-reviewer の既存テスト群への影響がゼロ。

### Negative

- custom reviewer 1 件でも coordinator 経路を通るため、zero-reviewer 以外の全 custom reviewer job で
  pipeline 形状が変わる。既存のカスタムレビュワーテストは `regression-gate` / coordinator 遷移の更新が必要。
- `resolveActiveReviewer` が「standard path と exhaustion attribution 専用」になるため、その役割が分散する。
  将来のリファクタリングでは追跡が必要。
- 並行実行中の中間 persist 競合は「最終 merge persist が authoritative」という運用的な許容に依存する（Phase 1 の既知債務）。

### Known Debt / Deferred

- clustered fixer（finding を file/subsystem 単位でグルーピングして fixer を分割）— Phase 2
- reviewer scheduler（activation + cost/signal ベースの reviewer 選択最適化）— Phase 3
- managed runtime での並列 custom reviewer フル対応（`listChangedFiles` 空の既知制約の解消）
- coordinator 並列実行の同時実行数上限（輻輳制御）— Phase 3 の scheduler に委ねる
- skipped（activation 不一致）member の job 内再活性化 — 現行は job 内固定（単一パス activation の意味論を踏襲）
- coordinator の round 予算（`maxIterationsByStep[custom-reviewers]`）の config 公開 — 必要になれば別 request

## References

- Request: `specrunner/changes/reviewer-parallel-execution/request.md`
- Design: `specrunner/changes/reviewer-parallel-execution/design.md`
- Spec: `specrunner/changes/reviewer-parallel-execution/spec.md`
- Related: `specrunner/adr/2026-06-11-custom-reviewer-data-driven-extensibility.md`（直列 reviewer チェーン・judge 契約・chain 合成の基盤。本 ADR はこの上に Phase 1 並列化を積む）
- Related: `specrunner/adr/2026-06-12-reviewer-chain-regression-gate.md`（regression-gate 設計。coordinator approved 後の遷移は本 ADR で変更しない）
- Related: `specrunner/adr/2026-06-12-reviewer-activation-declarative-gate.md`（activation 判定と `evaluateActivation`。invalidation で再利用）
- Related: `specrunner/adr/2026-06-04-pipeline-descriptor-registry.md`（PipelineDescriptor + `composeReviewerDescriptor`）
- Related: `specrunner/adr/2026-06-04-pipeline-roles-neutral-engine.md`（descriptor 駆動の neutral engine）
- Related: `specrunner/adr/2026-05-28-tool-driven-step-completion.md`（JUDGE_REPORT_TOOL 契約）
