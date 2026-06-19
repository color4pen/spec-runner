# Design: カスタムレビュワーの並列実行 + per-reviewer status tracking + invalidation

## Context

custom reviewer は現在、impl phase の reviewer chain（`["code-review", ...customReviewers]`）として
**宣言順に直列実行**される（ADR-20260611 / ADR-20260612）。各 reviewer は独立した収束ループ
（review → needs-fix → 共用 code-fixer → 再 review → approved）を持ち、最後の reviewer が approved に
なった後に regression-gate が走り conformance へ進む。reviewer が複数あると review（実測 5〜8 分）と
fix（3〜8 分）が reviewer 数だけ積み上がり、wall-clock が線形に増える。

review は **読み取り専用の独立操作**なので論理的には並列化できる。一方 fix は `code-fixer` が共用で、
複数 reviewer の findings が同じファイルを別方向に修正しうるため並列化できない。本変更（Phase 1）は
review フェーズを並列化し、blocking findings を集約して code-fixer に 1 回で渡し、fix 後に
activationPaths ベースで再 review 対象を絞る（invalidation）。

現状コードの前提（参照先を実コードで確認した結果）:

- pipeline は `Pipeline.runInternal`（`src/core/pipeline/pipeline.ts:181`）の while ループで遷移表を
  駆動し、**1 ステップずつ直列実行**する。並列ステップの概念はない。
- reviewer chain の遷移は `buildReviewerChainTransitions`（`src/core/pipeline/reviewer-chain.ts:143`）が
  生成し、`code-fixer` の戻り先解決に `resolveActiveReviewer`（同 70 行、`startedAt` 最新で active を判定）を使う。
  並列実行では「最後に走った reviewer」が成立しない。
- pipeline 形状は `PipelineDescriptor`（`src/core/pipeline/types.ts:61`）でデータ化され、
  `composeReviewerDescriptor`（`src/core/pipeline/compose-reviewers.ts`）が **custom reviewer 非空時のみ**
  base を拡張する。reviewer ゼロでは base を参照同一で返す（ADR-20260611 D9、zero-overhead 不変条件）。
- judge 契約（findings 報告・verdict の CLI 導出 `deriveJudgeVerdict`・finding ref 実在検証・
  no-tool-call escalation）は `executor.ts` の `isJudgeStep`（`reportTool === JUDGE_REPORT_TOOL` の
  identity 判定）に集約され、custom reviewer step は無改修で全防御を受ける（`createCustomReviewerStep`）。
- step 実行ライフサイクル（activation gate・input validation・verdict 導出・StepRun 記録・commit/push・
  lineage）は `StepExecutor.execute`（`src/core/step/executor.ts:95`）に集約され、**1 セッション/1 ステップ**
  前提で書かれている。commit/push は `finalizeStepArtifacts → commitAndPush`（`git add -A && commit && push`）。
- activation は `evaluateActivation`（`src/core/reviewers/activation.ts:49`）が
  `{ changedFiles, requestType }` から決定的に判定する。changedFiles は
  `RuntimeStrategy.listChangedFiles(base, cwd, branch)`（local: `git diff --name-only <base>...HEAD`、
  managed: `[]`）で取得する。
- `JobState.reviewers`（`src/state/schema.ts:314`）は snapshot 配列で、`paths` / `requestTypes` を持つ
  （`ReviewerSnapshot`、`src/kernel/reviewer-snapshot.ts:55-56`）。snapshot は job 開始時に固定される。
- top-level JobState フィールド（`reviewers` / `decisions`）は **state.json projection** に丸ごと書かれ
  （`stateToStateJson` の spread、`src/store/job-state-store.ts:752`）、`validateJobState` で読み戻される。
  event-journal が threading するのは history と steps のみで、top-level フィールドは journal 対象外。
- `collectFindingsLedger`（`src/core/pipeline/findings-ledger.ts:27`）は reviewer chain
  （`["code-review", ...names]`）の全 run から fixable findings を集約・dedup する。regression-gate 用。

並列化の核心制約（実コードから導出）:

1. **git index 競合**: 同一 worktree で `git add/commit` を並行実行すると `index.lock` 競合で失敗する。
   review セッションは各自固有の result file（`customReviewerResultPath`）しか書かないが、commit/push は
   直列化が必須。
2. **state 書き込み競合**: `StepExecutor.execute` は実行中に複数回 `store.persist` する。並行実行すると
   last-write-wins で中間 persist が失われうる。最終 state は merge して 1 回 authoritative に persist する。
3. **active reviewer 概念の崩壊**: 並列完了では「最後に走った reviewer」が定義できない。code-fixer の入力と
   戻り先解決を、`resolveActiveReviewer` ではなく per-reviewer status と決定的 predicate に置き換える。

## Goals / Non-Goals

**Goals**:

- custom reviewer の review フェーズを並列実行する（reviewer ≥ 2 で wall-clock を直列時より短縮）。
- needs-fix の reviewer の findings を集約し、1 回の code-fixer セッションに渡す。全 approved なら fixer skip。
- fixer 後、変更ファイルと各 reviewer の activationPaths を照合し、該当 reviewer のみ再 review する（invalidation）。
- per-reviewer status（pending / approved / skipped）を `JobState.reviewerStatuses` に記録し、
  approved かつ未 invalidate の reviewer を resume 時に skip する。
- regression-gate は全 reviewer approved 後に従来どおり走る。`collectFindingsLedger` は変更しない。
- custom reviewer ゼロでは PipelineDescriptor を byte-identical に保ち、既存テストを無変更 green にする。
- custom reviewer 1 件では並列の恩恵はないが status tracking / invalidation が機能し、直列と等価に収束する。

**Non-Goals**:

- clustered fixer（finding を file/subsystem 単位でグルーピングして fixer を分割）— Phase 2。
- reviewer scheduler（activation + cost/signal ベースの reviewer 選択最適化）— Phase 3。
- code-review（built-in、always-run の judge）の並列化。code-review は custom reviewer 群の前段で
  従来どおり直列に収束する。
- managed runtime での並列 custom reviewer のフル対応（`listChangedFiles` が `[]`、agent 自動登録未対応の
  既知制約を継承。local runtime を一次対象とする）。
- findings 台帳 / reviewerStatuses の job をまたぐ永続化、worktree 分離による完全並列 fix。

## Decisions

### D1: per-reviewer status を `JobState.reviewerStatuses` として state に持つ（architect 採用）

`StepRun[]` の最後の verdict から active reviewer / 各 reviewer の状態を推論する方式は、並列完了で
複数 reviewer が同時に終わると破綻する。集約的な status record を別途持つ。

```
ReviewerStatus {
  name: string;
  status: "pending" | "approved" | "skipped";
  approvedAtCommit?: string | null;   // approved 時の HEAD SHA（invalidation 起点）
  activationPaths?: string[];         // snapshot.paths のコピー（invalidation 照合用）
  invalidatedByCommit?: string | null;// fixer により pending に戻された時の HEAD SHA
}
JobState.reviewerStatuses?: ReviewerStatus[];   // backward compat: 不在 OK
```

`ReviewerStatus` は `src/kernel/reviewer-snapshot.ts` に置く（`ReviewerSnapshot` と同様、state→kernel の
import 方向を守る）。`JobState.reviewerStatuses` は top-level フィールドなので `stateToStateJson` の spread で
**state.json に自動 round-trip** し、event-journal threading は不要（`reviewers` / `decisions` と同型）。
`validateJobState` に「present 時は配列、各要素は name(string) + status を持つ」軽量検査を足す（absence OK）。

- **Rationale**: resume / invalidation / 将来の scheduler 拡張のいずれも「各 reviewer の現在状態」を
  O(1) で参照する必要がある。StepRun からの推論は並列で壊れ、推論ロジックが複数箇所に散る。
- **Alternatives considered**:
  - (A) StepRun の最新 verdict から status を導出 → 並列完了で active が定義不能、resume skip も導出不能。
  - (B) reviewers snapshot に status を可変フィールドとして混ぜる → snapshot は「job 開始時固定」の不変物で
    あるべき（実行中の定義変更を無視する設計）。可変 status は別レコードに分離する。

### D2: 並列 review は custom reviewer 非空時のみ合成される「coordinator」で表現する

`composeReviewerDescriptor` が custom reviewer を 1 件以上検出したときだけ、code-review と conformance の
間に **仮想 coordinator ノード `custom-reviewers`** を持つ並列 review 構造を合成する。reviewer ゼロでは
既存の早期 return（base を参照同一で返す）をそのまま通り、coordinator は pipeline に現れない。
standard / fast の `STANDARD_TRANSITIONS` / `FAST_TRANSITIONS` と `buildReviewerChainTransitions([code-review])`
は **一切変更しない**。

合成後の構造:

- steps map: 各 custom reviewer step（`createCustomReviewerStep`）+ regression-gate step を従来どおり保持。
  coordinator は仮想ノードなので steps map には入れない（engine が特別扱いする、D4）。
- 遷移（後述 D7 の builder が生成）:
  - `code-review approved`(clean) → `custom-reviewers`
  - `custom-reviewers approved` → `regression-gate`
  - `custom-reviewers needs-fix` → `code-fixer`
  - `regression-gate approved`(clean) → `conformance`、`regression-gate needs-fix` → `code-fixer`
  - `code-fixer` の戻り先は決定的 predicate（D7）
- descriptor に `parallelReview?: { coordinator: string; members: string[] }` を足し、engine に fan-out 対象を
  宣言的に伝える。

- **Rationale**: 要件 7（reviewer ゼロ無影響）は「custom reviewer がゼロ」という構造的性質。実行時 skip
  ではなく合成時の構造で表現すれば standard pipeline が byte-identical に保たれ、zero-reviewer テストが
  無変更 green になる（ADR-20260611 D9 / ADR-20260612 D1 と同じ手法）。
- **Alternatives considered**:
  - (A) STANDARD_DESCRIPTOR に常設し runtime で並列/直列を分岐 → zero-config parity が崩れ遷移表が変わる。
  - (B) 専用 pipeline id を新設 → 既存合成と二重管理。

### D3: 並列実行は engine が `StepExecutor.execute` を member ごとに同時呼び出しし、結果を merge する

coordinator を「fan-out して member step 群を同時実行する」engine 機能として実装する。
`Pipeline.runInternal` で `currentStep === parallelReview.coordinator` を検出したら:

1. その時点の `reviewerStatuses` から **pending member** を決定する（D6 の invalidation を入口で適用）。
2. pending member ごとに `this.executor.execute(memberStep, baseState, deps)` を **`Promise.allSettled`** で
   同時実行する（member step は steps map にあるので executor の全ライフサイクルをそのまま再利用する）。
3. 各 member の返す state（base から自分の `steps[member]` と history delta のみ追加された state）を
   `mergeParallelReviewerStates(base, results)` で in-memory に merge する（member の step key は互いに
   disjoint なので merge は well-defined。history は delta を completion 順に concat）。
4. status 更新（D5）+ synthetic coordinator StepRun 記録（D4）+ aggregate verdict 算出（D5）。
5. merge した state を **1 回 authoritative に persist** する。

executor 側の唯一の改修は **commit serialization**: instance レベルの promise-chain mutex で
`finalizeStepArtifacts`（= commit/push）呼び出しを直列化する。これにより並行 review でも
`git add/commit/push` は 1 件ずつ実行され `index.lock` 競合を避ける。session 実行（重い部分）・activation の
`listChangedFiles`（read-only git）・`prepareStepArtifacts`（member 固有 file への write）・verdict 導出は
並行のままでよい。中間 `store.persist` は last-write-wins で競合するが、engine の最終 merge persist が
authoritative なので許容する（Risks 参照）。

- **Rationale**: executor を member ごとに再利用することで、activation gate・judge verdict 導出・
  finding ref 実在検証・StepRun 記録・lineage・commit/push の防御を**重複実装せず**並列化できる。
  追加コードは「commit mutex」「state merge 純関数」「engine の fan-out 分岐」の 3 点に局所化する。
- **Alternatives considered**:
  - (A) coordinator を CliStep にして内部で runner を直接駆動 → executor ライフサイクルを丸ごと再実装する
    ことになり patchwork。judge 契約の二重系統化リスク。
  - (B) finalizeStep を「session 実行」と「commit」に二相分解し batch 末尾で 1 回 commit → 改修面が広く
    既存 single-step 経路にも波及する。commit mutex の方が改修が小さく安全。
  - (C) worktree を reviewer ごとに分離して完全独立実行 → 200-500ms setup + disk/agent のコスト、
    conflict 解消が必要（architect 却下、完全並列 fix と同根）。

### D4: coordinator を loop step として扱い、各ラウンドの aggregate verdict を synthetic StepRun に記録する

coordinator は steps map に実体を持たないが、`loopNames` / `loopFixerPairs[coordinator]=code-fixer` /
`maxIterationsByStep[coordinator]` / `roles[coordinator]={role:"gate",phase:"impl"}` に登録する。
各並列ラウンド完了時に engine が coordinator 名で **synthetic StepRun**（`outcome.verdict` = aggregate、
`sessionId: null`、`startedAt`/`endedAt`）を `steps[coordinator]` に push する。

これにより:

- `getStepOutcome(coordinator)` が最新 synthetic verdict を返し、遷移表ルックアップが自然に成立する。
- 既存の per-step exhaustion / episode-reset 機構（`Pipeline` の `loopIters` / `tryExhaust` /
  `resolvePairedReviewForFixer`）が coordinator を「paired fixer を持つ loop step」として扱える。
  round 予算は `maxIterationsByStep[coordinator]` で与え、収束しなければ exhaustion → awaiting-resume
  （resumeStep = code-fixer）に落ちる。
- `resolveActiveReviewer` は code-fixer の **routing からは外す**（D7）が、exhaustion **attribution** 用には
  そのまま機能する（coordinator / regression-gate / code-review が StepRun を持つため `startedAt` 比較が成立）。
- `LOOP_ERROR_CODES[coordinator]`（例: `CUSTOM_REVIEWERS_RETRIES_EXHAUSTED`）を追加する。

- **Rationale**: 「並列 review 1 ラウンド = 1 つの aggregate 結果を出す step」と捉えると、既存の loop /
  exhaustion / episode-reset 機構を**新規ロジックなしで**再利用でき、観測性（ラウンドごとの集約 verdict が
  state に残る）も得られる。
- **Alternatives considered**:
  - (A) coordinator を loop 機構の外に置き独自の round counter を持つ → exhaustion / resume 機構を二重化。
  - (B) 代表 member 1 件を loop step に流用 → どの member が代表かが並列で定義不能。

### D5: aggregate verdict 規則と code-fixer への findings 集約

並列ラウンド完了後の集約規則:

- いずれかの member が `escalation` → aggregate = `escalation`（finding ref 不在 / decision-needed / ok=false が
  1 件でもあれば人間にエスカレート）。
- escalation がなく、いずれかの member が `needs-fix` → aggregate = `needs-fix` → code-fixer。
- 全 member が `approved`（または skipped）→ aggregate = `approved` → regression-gate。fixer は **skip**。

status 更新: 各 member の最新 verdict から `approved`（approvedAtCommit = ラウンド完了時 HEAD）/ `pending`
（needs-fix）/ `skipped` を `reviewerStatuses` に反映する。

code-fixer は composed path（`state.reviewers?.length > 0`）で `resolveActiveReviewer` を使わず、
**needs-fix の全 member の最新 findings を集約**（`collectFixableFindings` + `dedupeFindings`）して 1 回の
セッションに渡す。`reads()` は needs-fix の各 member の result file を IoRef として返し（pre-validation が
存在を確認）、`buildMessage` は集約 findings を inline 埋め込みする（既存の findings-inline 経路を踏襲、
reviewer 名は複数なので "custom reviewers" 等の集約ラベル）。conformance 起点 fixer / regression-gate 起点
fixer / code-review ループ起点 fixer の入力解決は従来どおり（D7 の戻り先 predicate と対応する findings 源を
選ぶ）。standard path（reviewers 空）は `resolveActiveReviewer([code-review])` のまま不変。

- **Rationale**: 要件 2 / 3。review は安全に並列化でき、fix は共用 code-fixer で 1 回に集約する方が同一
  ファイルの相反修正を構造的に防げ、regression-gate（全 findings 台帳照合）とも整合する。
- **Alternatives considered**:
  - 各 member が独立に code-fixer を呼ぶ（完全並列 fix）→ 同一ファイルの別方向修正、worktree 分離コスト、
    conflict 解消（architect 却下）。

### D6: invalidation は approvedAtCommit からの git diff × activationPaths で行う（architect 採用）

coordinator 入口（fixer から戻った再入時）で、`status === "approved"` の各 member について:

- `touched = listChangedFiles(member.approvedAtCommit, cwd, branch)` を取得する。
  `listChangedFiles` の実装は `<ref>...HEAD`（three-dot）。approvedAtCommit は同一 branch 上で HEAD の
  ancestor（fixer commit が上に積まれる）なので merge-base == approvedAtCommit となり three-dot は実質
  two-dot（approvedAtCommit..HEAD）と一致する。**新規 seam は不要**で既存 `listChangedFiles` を再利用する。
- `evaluateActivation({ paths: member.activationPaths }, { changedFiles: touched, requestType })` が
  `activated: true` を返したら（= touched が paths にマッチ、または paths 未定義の always-activate）、
  その member を `pending` に戻す（invalidatedByCommit = 現 HEAD）。

pending に戻った member だけが当該ラウンドで再 review される。activationPaths 外のみ変更された member は
approved のまま再 review されない。

- **Rationale**: 要件 4。正確な invalidation には fixer の変更ファイルと既存 glob 照合（`evaluateActivation`）を
  そのまま流用できる。各 member を「自分の承認時点からの差分」で判定するため、複数 fixer ラウンドでも
  正しく累積する。paths 未定義 reviewer を常に pending に戻すのは architect の合意どおり。
- **Alternatives considered**:
  - (A) fixer 直前 HEAD を別途記録して差分を取る → 各 member の承認時点が異なるラウンドをまたぐと不正確。
    approvedAtCommit 起点なら per-reviewer に正しい。
  - (B) fixer が触れたファイルを agent 申告に頼る → observable でなく信頼できない。git diff が真実。
  - (managed) `listChangedFiles` が `[]` → touched 空 → invalidation 不発（fail-safe で再 review されない）。
    managed は並列 custom reviewer 非対応の既知制約として整合（Non-Goals）。

### D7: code-fixer の戻り先を `resolveActiveReviewer` から決定的 predicate に置き換える（composed path のみ）

並列実行では「最後に走った reviewer」が定義できないため、composed path の code-fixer 戻り先解決を
`resolveActiveReviewer` ベースから **優先順位付き `when` predicate** に置き換える。新しい遷移 builder
`buildParallelReviewerTransitions` を `reviewer-chain.ts` に追加し、`composeReviewerDescriptor` が
`buildReviewerChainTransitions(fixableChain)` の代わりに使う。code-fixer の戻り先（優先順）:

1. `conformanceFixInProgress(state)` → `conformance`（既存 `getConformanceFixContext` を再利用）
2. `regressionGateActive(state)` → `regression-gate`（regression-gate 最新が needs-fix、または approved+fixable）
3. `codeReviewLoopActive(state)` → `code-review`（coordinator が未稼働 かつ code-review 最新が needs-fix）
4. （default）→ `custom-reviewers`（custom reviewer ループの再 review）

`resolveActiveReviewer` 自体は削除せず、standard path（`buildReviewerChainTransitions([code-review])`）と
exhaustion attribution（D4）でのみ使い続ける。code-review の収束ループ（needs-fix → fixer → code-review、
approved+fixable → fixer → 次）は composed path でも維持し、code-review が clean approved になって初めて
coordinator へ進む。

- **Rationale**: architect の「`resolveActiveReviewer` 置き換え」は code-fixer の入力（D5）と戻り先解決を
  指す。並列で壊れる「recency 推論」を、state から決定的に再構成できる predicate に置き換えることで
  並列完了でも一意にルートできる。standard path を触らないことで zero/single の回帰を避ける。
- **Alternatives considered**:
  - (A) state に「fixer origin」可変フラグを足す → state 表面が増え、history からの再構成より脆い。
  - (B) coordinator 専用 fixer を新設 → 収束ループの組み合わせ爆発（ADR-20260611 Alt-C と同根）。

### D8: resume skip は reviewerStatuses 駆動の pending 選択から自然導出する

coordinator は入口で `reviewerStatuses` を読み、`approved` かつ未 invalidate の member を pending 集合から
除外する。resume 時は persist 済みの `reviewerStatuses` がそのまま読まれるため、approved & 未 invalidate の
member は再実行されず、pending（needs-fix 中 / invalidate 済み）の member だけが再 review される。
resume の特別分岐は不要で、coordinator の pending 選択ロジックに吸収される。

- **Rationale**: 要件 5。resume を独立機構にせず status の射影として表現することで、通常実行・invalidation・
  resume が同一コードパスに収束する（特殊ケースの分岐を増やさない）。
- **Alternatives considered**:
  - resume 専用の skip 判定を別途持つ → 通常実行の status 判定と二重系統になり drift する。

### D9: regression-gate / 累積 findings 台帳は不変（要件 6）

regression-gate は coordinator が `approved` を返した後（= 全 member approved）に従来どおり走る。
`collectFindingsLedger(state, deriveImplReviewerChain(state))` は reviewer chain
（`["code-review", ...member names]`）の全 run から fixable findings を集約する。coordinator は member 名と
別名（`custom-reviewers`）で chain に含まれないため、台帳は member の実 findings をそのまま集約でき、
**変更不要**。regression-gate の遷移・予算・ledger 構築はすべて据え置く。

- **Rationale**: 要件 6 の明示。並列化は review の実行順序を変えるだけで、各 member の findings は従来どおり
  `steps[member]` に残る。台帳は run の集合演算なので順序非依存。
- **Alternatives considered**: なし（変更しないことが要件）。

## Risks / Trade-offs

- [並行 commit の `index.lock` 競合] → D3 の commit mutex（executor instance の promise-chain）で
  `finalizeStepArtifacts` を直列化する。review セッション本体・read-only git は並行のまま。
- [先行 member の commit で後続 member の `headBeforeStep` が古くなる] → `commitAndPush` は staged 変更が
  あれば通常 commit する（head-advance 分岐は staged 変更が無い時のみ）。後続 member は自分の result file を
  staged に持つため通常 commit され、取りこぼさない。先行 member の `git add -A` が後続の result file を
  巻き込んで先に commit したケースでも、後続は「staged 無し + head 進行」で push のみ（既 commit 済みで
  データロス無し）。E2E で複数 member の result file が全て branch に乗ることを検証する。
- [並行実行中の中間 `store.persist` が last-write-wins で競合] → engine が最終 merge state を 1 回
  authoritative に persist する。atomic-write（temp+rename）なので torn file は出ず、中間 persist が
  論理的に上書きされるだけ。並列ウィンドウ中のクラッシュは resume 時に `reviewerStatuses`（直前の clean
  point）から pending を再導出して冪等回復する。Phase 1 の許容トレードオフとして明記する。
- [coordinator の synthetic StepRun が exhaustion 機構を誤発火させる] → coordinator を `loopNames` /
  `loopFixerPairs` / `maxIterationsByStep` に正しく登録し、`skipped`/`approved` で false exhaustion を
  起こさないことを既存 pipeline テスト相当のケースで検証する（D4）。
- [invalidation の過剰発火（result file 変更で別 reviewer が pending に戻る）] → invalidation は
  approved member の承認時点からの diff を見るが、review ラウンド内に code 変更は起きない（review は
  read-only、result file は `specrunner/changes/` 配下で通常 src を対象とする reviewer の paths に
  マッチしない）。過剰発火しても「再 review = 安全側」であり収束性を壊さない。round 予算（D4）が最終的な
  停止保証。
- [managed runtime で並列 / invalidation が機能しない] → `listChangedFiles` が `[]` のため activation /
  invalidation が fail-safe（under-activate / 再 review しない）になる。custom reviewer の managed 非対応は
  既存の既知制約であり、本変更で新たな退行は無い。local を一次対象とコメントで明記する。
- [reviewer 1 件で並列経路を通すことの過剰] → 1 件でも coordinator 経路を通すが、fan-out は member 1 件の
  `Promise.allSettled` で直列と同等のコスト。status / invalidation は 1 件でも機能する（要件 8）。

## Open Questions

- coordinator の round 予算（`maxIterationsByStep[custom-reviewers]`）を各 member の `maxIterations` の
  最大値とするか、pipeline default とするか。初期は **member maxIterations の最大値**を採用し、必要なら
  config 公開を別 request とする。
- skipped（activation 不一致）member を fixer 後に再活性化すべきか。初期は **skipped は job 内で固定**
  （単一パス activation の現行意味論を踏襲）とし、再活性化は Non-Goal とする。
- 並列 review の同時実行数に上限を設けるか（agent セッション数の輻輳制御）。初期は member 数ぶん全並列とし、
  上限は scheduler（Phase 3）に委ねる。

## Migration Plan

新規 state フィールド（`reviewerStatuses`）の **additive** な追加であり、既存 state の必須フィールド・
config・成果物レイアウトは変更しない。`reviewerStatuses` 不在の既存 state は coordinator 入口で初期化
（全 member pending）されるため後方互換。並列化は **custom reviewer 非空時のみ**有効（opt-in）で、
standard / fast / zero-reviewer は byte-identical のまま。進行中 job は `JobState.reviewers` snapshot により
pipeline 形状が固定されるため resume 時も一貫する。ロールバックは本変更の revert で完結する
（`reviewerStatuses` は読み飛ばされ、直列 chain に戻る）。
