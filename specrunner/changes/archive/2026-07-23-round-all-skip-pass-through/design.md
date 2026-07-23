# Design: custom reviewer round の全員 skip を構造的 skip として green で通す

## Context

custom reviewer の担当判定（`activationPaths` / `requestTypes`）は agent 起動前の決定的計算であり、
担当外の member は agent session を生成せず executor の活性化ゲートで `{kind: "skipped"}` を返す
（`src/core/step/executor.ts:270-294`）。現状、coordinator（`ParallelReviewRound`）は「全 member が
skip した round」を非 green と見なし、以下の 3 箇所が連動して job を停止させる:

- `src/core/pipeline/reviewer-status.ts` の `aggregateVerdict`: 非空かつ全 `skipped` → `escalation`
  を返す（250-288 の all-skip branch）。
- `src/core/pipeline/parallel-review-round.ts:473-483`: `allMembersSkipped` のとき roundError に
  `ROUND_ALL_MEMBERS_SKIPPED` を設定する（かつ 468 行の guard で `applyRoundResults` を抑止し member を
  pending に残す）。
- `src/core/pipeline/reviewer-chain.ts:456-466`: coordinator escalation を、error.code が
  `ROUND_ALL_MEMBERS_SKIPPED` のときだけ regression-gate へ routing する（残りの step を走らせる）。
- `src/core/pipeline/pipeline.ts:395-425`: 終端 seam で `state.error?.code === "ROUND_ALL_MEMBERS_SKIPPED"`
  を検出し `awaiting-resume` に落とす（PR 作成後に停止）。

この経路は直前の change `custom-reviewer-canon-binding`（archive 2026-07-22）の D6 で導入された
「checked=0 は非 green」原則の適用だった。しかし担当判定は宣言的設定（glob）が正であり、「全員担当外」は
設定どおりの正当な帰結である。runtime がこれをエラー扱いして停止するのは、設定の敷き漏れ検査
（coverage floor = 別レイヤの責務）を運転時の halt で代行する層違いであり、担当外の正当な変更が毎回
operator 介入を要求して自律収束を壊す。加えて、停止した job の resume は同一条件で再び全員 skip →
同一エラーで再停止し、回復経路が存在しない（issue #911 の実測）。

本 change は D6 の「全 skip → escalation」判断を反転し、`custom-reviewer-canon-binding` の他の決定
（canon 束縛 D1〜D5 / D7）はそのまま維持する。全員 skip の round は「構造的に発生しなかった round」として
green で通し、代わりに per-member の skip 証跡（既存の member journaling）で第三者検証可能性を担保する。

### 現状コードの前提（確認済み）

- 活性化ゲートは skip 時に `evaluateActivation` の `decision.reason`（例: `no changed files matched
  paths [src/auth/**]` / `requestType "bug-fix" is not in [spec-change]`）を skipReason として返す
  （`src/core/reviewers/activation.ts`）。
- coordinator の fan-out は fulfilled な skip 結果（`{kind:"skipped", skipReason}`）も `members` 配列へ
  push し、`CommitOrchestrator.commitRound` が `projectSkip` + `skipHistoryEntry` で state に射影する
  （`parallel-review-round.ts:317-334`, `commit-orchestrator.ts:556-570`）。
- store の `persist` は steps / history の delta を events.jsonl へ append し、`stepRunToRecord` は
  `skipReason` を outcome に含める（`src/store/event-journal.ts:392-413`, `src/store/job-journal.ts:186-193`）。
  → **per-member の skip 事実と理由は既に journal event（step-attempt + transition record）として記録される。**
- `commitRound` は `state.error = roundError`（`commit-orchestrator.ts:594`）で state.error を毎 round
  上書きする。roundError が null なら sticky な旧 error はクリアされる。
- `verdictOfResult` は halt → `escalation`、skipped → `skipped` を返す（`reviewer-status.ts:370-379`）。
  error/skip の verdict 区別は本 change では変更しない。
- resume 時 `transitionJob(state,"running",{patch:{error:null,...}})` で state.error を null にする
  （`src/core/command/resume.ts:212`）。

## Goals / Non-Goals

**Goals**:

- 全 member が活性化条件不一致で skip した round（非空・全 `skipped`）を、gate を塞がない `approved`
  相当の集約 verdict で成立させ、roundError を設定せず pipeline を後続 step へ進める（要件 1）。
- per-member の skip 事実と理由を journal event として記録する既存経路を保持し、テストで固定する
  （要件 2）。全 skip でも round は実行し member 証跡を残す。
- error と skip の区別を維持する: skip/error 混在 round は従来どおり停止する（要件 3）。
- executor の活性化ゲート（diff 導出不能時 fail-closed）は変更しない（要件 4）。
- 全 skip の member を pending に残し、後続 round で活性化条件を新 diff に対して再評価させる（要件 5）。
- 旧 `ROUND_ALL_MEMBERS_SKIPPED` エラーで停止した既存 job が resume で完走する後方回復経路を成立させる
  （要件 6）。

**Non-Goals**:

- 担当敷き漏れの静的検査（coverage floor: 「src/core/** は最低 1 レビュワーが担当」等の起動時検証）。別 request。
- resume が reviewer 定義 / snapshot を再読込する機構（issue #911）。
- `activationPaths` の設定値の変更・拡張。
- 活性化ゲート自体（`executor.ts`）の判定ロジック変更。
- `custom-reviewer-canon-binding` の canon 束縛（D1〜D5 / D7: `computeCanonHash` /
  `selectPendingMembers` / `applyRoundResults` の canonHash / 除外 allowlist / ReviewerStatus.canonHash）
  の変更。本 change は同 change の D6（全 skip escalation）のみを反転する。

## Decisions

### D1: 全 skip の集約 verdict を approved にする（verdict 語彙は維持、集約のみ変更）

`aggregateVerdict`（`src/core/pipeline/reviewer-status.ts`）の「非空かつ全 skipped → escalation」分岐を
削除し、全 skip が `approved`（既定の `hasNeedsFix ? "needs-fix" : "approved"` の approved）に落ちるように
する。escalation 短絡（member に escalation が 1 件でも → escalation）と needs-fix 優先は不変。

- **Rationale**: 集約関数は「集約」であり、per-member の verdict 語彙（`verdictOfResult` の skipped /
  escalation / approved）は変えない。全 skip を approved に**集約**するのは、architect が却下した
  「skip を approved と同値に統合（verdict 語彙の融合）」ではない。verdict 語彙は維持し集約だけを変える、
  という architect 採用方針そのもの。member の verdict は依然 `skipped` として journal に残る。
- **Alternatives considered**:
  - 現状維持（全 skip → escalation）: 担当外の正当な変更が毎回停止し自律収束を壊す（architect 却下済み）。
  - skip verdict を approved に書き換える（`verdictOfResult` で skipped→approved）: error（halt→escalation）が
    skip に紛れる余地を作らないが、per-member 証跡が approved に化けて「誰が走らなかったか」が消える。verdict
    語彙の融合であり architect 却下方針。集約層のみで解決する。

### D2: 全 skip で roundError を設定しない（sticky error のクリアで後方回復も成立）

`parallel-review-round.ts` の `allMembersSkipped` 分岐（473-483）から `ROUND_ALL_MEMBERS_SKIPPED` の
roundError 設定を削除する。roundError は null のまま `commitRound` に渡り、`state.error = roundError` で
既存の sticky error（もしあれば）を null にクリアする。observability のため
`logPipelineDiag("pipeline:coordinator:all-members-skipped", …)` の診断ログは残す（error ではなく構造的
skip の痕跡として）。

- **Rationale**: roundError を設けないことが要件 1（終端 seam の分岐を発火させない）と要件 6（後方回復）を
  同時に満たす。既存 job が `ROUND_ALL_MEMBERS_SKIPPED` を state.error に持っていても、coordinator round が
  再走して roundError=null で commit すれば sticky error がクリアされ、終端 seam は `awaiting-archive` に進む。
- **Alternatives considered**:
  - roundError を別の非停止コードに置換: 停止しないなら error として持つ意味がなく、終端 seam / routing の
    条件分岐が残り続ける。error は設定しないのが最小。

### D3: 全 skip の member を pending に残す（applyRoundResults 抑止 guard を維持）— 恒久 free-pass 回避

`parallel-review-round.ts:468` の `if (!inspectionEscalated && !allMembersSkipped)` guard を**維持**し、
全 skip 時は `applyRoundResults` を適用しない（member status を `skipped` に確定させず pending に残す）。

- **Rationale**: 要件 5。`applyRoundResults` は skipped verdict を status `skipped` に確定させ、
  `selectPendingMembers` はそれを job lifetime 恒久に pending から除外する（`reviewer-status.ts:155`）。全 skip の
  member を skipped 確定させると、後続 round（fixer が diff を変えた後など）で活性化条件が再評価されず恒久
  free-pass になる。pending に残せば毎 round fan-out で再評価される（活性化ゲートは agent 起動前の決定的計算で
  安価）。
- **Alternatives considered**:
  - 全 skip でも `applyRoundResults` を適用（skipped 確定）: 恒久 free-pass 穴。却下（要件 5 違反）。
- **Note**: `allMembersSkipped` フラグ自体は D3 の guard のためだけに残す。D2 でその第 2 用途（roundError 設定）
  は削除される。関連コメント（`parallel-review-round.ts:345-354`, `454-483`）は「構造的 skip として green で
  通し、member は pending に残す」旨へ更新する。

### D4: 終端 seam の ROUND_ALL_MEMBERS_SKIPPED 分岐を削除する

`pipeline.ts:395-425` の `if (state.error?.code === "ROUND_ALL_MEMBERS_SKIPPED") { … awaiting-resume … }
else { … awaiting-archive + commitFinalState }` から if 分岐を削除し、`nextStep === "end" && state.status
=== "running"` は常に awaiting-archive（+ `commitFinalState`）へ進む単一経路にする。関連コメント
（384-394）も削除・簡素化する。

- **Rationale**: 要件 1（終端 seam の分岐は発火しない）。D2 で roundError を設けないため分岐条件は恒真で
  false になるが、dead code を残すと将来の読者が「全 skip = 停止」と誤読する。除去して意図を明確にする。
- **Alternatives considered**: 分岐を残す（D2 により発火しない）: dead code + 誤読リスク。除去する。

### D5: reviewer-chain の all-members-skipped escalation routing を削除する

`reviewer-chain.ts:456-466` の coordinator `on: "escalation"` かつ `when: error.code ===
"ROUND_ALL_MEMBERS_SKIPPED"` → regression-gate の遷移を削除する。これにより coordinator の escalation は
全て default の `escalate` 終端（→ awaiting-resume）に落ちる。coordinator の `approved` → regression-gate /
`skipped` → regression-gate / `needs-fix` → code-fixer の各遷移は不変。

- **Rationale**: 要件 3。D1 で全 skip は escalation を返さなくなるため、この専用 routing は dead になる。かつ
  skip/error 混在 round（`aggregateVerdict(["skipped","escalation"])` → escalation）は、この遷移が無ければ
  default escalate → awaiting-resume で従来どおり停止する。ROUND_NONDECLARED_CHANGE / ROUND_HEAD_ADVANCED 等の
  他の coordinator escalation も従来どおり停止する（変化なし）。
- **Alternatives considered**: 遷移を残す（全 skip が escalation を返さないので発火しない）: dead code。除去する。

### D-journal: per-member skip 証跡は既存経路を保持する（新規 event type を作らない）

要件 2（skip 証跡の journal 記録）は新規のコードを要さない。全 skip の member も fulfilled skip 結果として
`members` 配列に push され、`commitRound` が `projectSkip`（state.steps へ verdict `skipped` + skipReason）と
`skipHistoryEntry`（`<member>-skipped` transition）を射影し、store の `persist` が step-attempt record
（skipReason 付き）と transition record を events.jsonl へ append する。本 change はこの経路を**変更しない**
（`members` push を削らない）。テストで journal に skip record が残ることを固定する。

- **Rationale**: 「round は実行し、構造的 skip として記録する」という architect 採用方針（round バイパス却下）
  と一致。既存の per-member journaling が「誰がなぜ走らなかったか」を機械的に確認可能にしている。新 event type は
  冗長。
- **Alternatives considered**:
  - 専用の all-skip 集約 event を追加: per-member record が既に理由付きで存在するため重複。round バイパスして
    集約 event だけ残す案は「round の実行痕跡が消える」ため architect 却下済み。

## テスト影響（旧挙動を固定している既存テストの期待更新）

要件 1/3（全 skip → 構造的 skip green）により旧挙動を固定している既存テストの期待を更新する。更新対象は
implementation-notes に列挙する（受け入れ基準）。

- `src/core/pipeline/__tests__/reviewer-status.test.ts`
  - `aggregateVerdict(["skipped", "skipped"])` の期待を `"escalation"` から `"approved"` に更新。
  - `aggregateVerdict([])` → `"approved"`（変更なし）、`aggregateVerdict(["approved","skipped"])` →
    `"approved"`（変更なし）、`aggregateVerdict(["needs-fix","skipped"])` → `"needs-fix"`（変更なし）、
    `aggregateVerdict(["skipped","escalation"])` → `"escalation"`（要件 3、追加/維持）。
  - TC-034/TC-048 系のコメント（all-skip escalation を前提とする破壊確認記述）を新挙動へ更新。
- `src/core/pipeline/__tests__/parallel-review-round-canon.test.ts`
  - `TC-006/TC-038`（全 skip → escalation / roundError=ROUND_ALL_MEMBERS_SKIPPED / 単一 member all-skip →
    escalation）の期待を「outcome=`approved`、coordinatorRun.outcome.verdict=`approved`、
    coordinatorRun.outcome.error=null」に更新。
  - `TC-009`（member が pending のまま）の期待は**維持**（D3 で pending 保持は不変）。
  - `TC-008`（mixed skip+approved → approved）は不変。describe / コメントの「escalation」語を新挙動へ追随。
- `tests/reviewer-activation-e2e.test.ts`
  - `TC-ACT-01`（paths 不一致で全 skip）: `result.status` の期待を `"awaiting-resume"` から
    `"awaiting-archive"` へ更新。member verdict `skipped` / skipReason / conformance 実行の assertion は維持。
  - `TC-ACT-02`「requestTypes 不一致で skip」: 同様に `"awaiting-archive"` へ更新。skipReason assertion 維持。
  - `TC-ACT-04` 第 1 テスト（単一 skip）: 同様に `"awaiting-archive"` へ更新。verdict `skipped` ≠ `approved`
    の assertion は維持。
  - `TC-ACT-04` 第 2 テスト（skip+approved 混在）/ `TC-ACT-02` 一致ケース / `TC-ACT-03` / `TC-ACT-05` は
    変更なし（従来どおり awaiting-archive）。ファイル冒頭の TC-040/TC-041 説明コメントを新挙動へ更新。

`custom-reviewer-canon-binding` の canon 束縛テスト群（invalidation / `round-git-scope` / `computeCanonHash`
/ `selectPendingMembers` の canon 分岐 / `applyRoundResults` の canonHash）は**期待更新不要**。本 change は
`aggregateVerdict` の集約と roundError / routing / terminal seam のみを触り、canon 束縛の入出力は変えない。

## 破壊確認（teeth のフォールバック検証）

各受け入れ基準に対応する「修正後挙動を旧挙動に戻すと該当テストが fail する」ことをテストコメントに記録する:

- `aggregateVerdict` の全 skip を `escalation` に戻す → 全 skip 構造 skip の pass-through テストと
  reviewer-activation-e2e の awaiting-archive assertion が fail する。
- `parallel-review-round.ts` に `ROUND_ALL_MEMBERS_SKIPPED` roundError を復活させる → 後方回復（error クリア）
  テストと coordinatorRun.error=null テストが fail する。
- D3 guard を外し全 skip で `applyRoundResults` を適用する → member が pending でなく skipped に確定し、
  「member pending 維持」テスト（TC-009 相当）が fail する。
- skip/error 混在の停止テストで member error を skip 扱いに緩めると → 混在停止テストが fail する
  （error/skip 区別の歯）。

## Risks / Trade-offs

- [Risk] 全員担当外の request が「1 件も実検査されず」に PR まで完走する（coverage の穴が runtime で検知
  されなくなる）→ Mitigation: これは architect が採用した意図的な挙動変更（「止めて人に聞く」→「通して記録
  する」）。敷き漏れ検知は coverage floor（別 request の Non-Goal）で扱う。per-member の skip 証跡が journal に
  残り、第三者が「どのレビュワーがなぜ走らなかったか」を機械的に確認できることで検証可能性を担保する。
- [Risk] skip/error 混在の停止が退行して全 skip pass-through に巻き込まれる（fail-open）→ Mitigation:
  `verdictOfResult`（halt→escalation）と `aggregateVerdict` の escalation 短絡は不変。混在は escalation を
  返し、D5 で専用 routing を削除したことで default escalate → awaiting-resume に停止する。専用の混在停止
  テストを追加して歯にする。
- [Risk] 全 skip の member を pending に残すことで毎 round fan-out が再走しコスト増 → Mitigation: 活性化
  ゲートは agent 起動前の決定的計算（git diff + glob）で agent session を生成せず安価。恒久 free-pass 回避
  （要件 5）の方が重要。
- [Risk] `custom-reviewer-canon-binding` の canon 束縛ロジックを誤って巻き込む → Mitigation: 変更は
  `aggregateVerdict` の集約・roundError 設定・terminal seam・chain routing の 4 箇所に限定し、canon 束縛の
  入出力（`selectPendingMembers` / `applyRoundResults` の canonHash 引数、除外 allowlist）には触れない。canon
  テスト群が無変更で green であることを検証ゲートで確認する。

## Open Questions

なし（全 skip の member を pending に残す方針は要件 5 で確定。coverage floor と #911 は明示的 Non-Goal）。
