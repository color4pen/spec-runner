# Design: 並列 round の worktree 検査を fail-closed 化する（検査不能を clean と区別し escalation）

## Context

`ParallelReviewRound` は fan-out 後、`runtimeStrategy.listWorktreeChanges(cwd)` で worktree の未 commit 変更を取得し、宣言外変更があれば round を halt（escalation）、宣言済み変更のみを scoped commit する（`architecture/adr/2026-07-13-execution-ownership-model.md` D3 / 提案 invariant B-15）。この worktree 検査が「member が宣言外の source を書き換えていないか」を機械的に固定する唯一の点である。

### 現状の構造と欠陥

- **seam contract**（`src/core/port/runtime-strategy.ts` L405-424）: doc comment に「**Never throws — returns [] on any error**」。戻り値は `Promise<string[]>`。`RuntimeStrategy.listWorktreeChanges?`（optional, L424）/ `RealRuntimeStrategy.listWorktreeChanges`（required, L534）。
- **local 実装**（`src/core/runtime/local.ts:845`）: `git status --porcelain -z --no-renames` を cwd で実行。exit 非ゼロ → `[]`、spawn 例外・その他例外の catch → `[]`。すなわち **成功して変更ゼロ** と **検査そのものが失敗** を同じ `[]` に潰している。
- **managed 実装**（`src/core/runtime/managed.ts:560`）: local worktree を持たない設計のため常に `[]`（parallel custom reviewer managed は既知の Non-Goal）。
- **consumer**（`src/core/pipeline/parallel-review-round.ts:222-259`）: `changed = await listWorktreeChanges(cwd)` → `partitionRoundChanges({changed, declared, slug})`。`offending` があれば escalation（`ROUND_NONDECLARED_CHANGE`）、`toStage` があれば `commitRoundArtifacts`。consumer は `[]` を「worktree に変更なし」として扱う。

`git status` が失敗すると `[]` が返り、consumer は `offending=[]` / `toStage=[]` と解釈する。結果として **宣言外変更の検査（B-15 の核）が黙って skip され、宣言済み成果物も commit されず、reviewer は approved のまま state に記録される**。これは「検査不能」を「clean」と同一視する **fail-open** であり、doc comment が「fail-safe」と書いているのと実際のセキュリティ特性が逆転している。`[]` が現状 3 状態（真の空 / 検査失敗 / worktree 不在）を潰しており、検査失敗時に halt 判定が空振りする。

## Goals / Non-Goals

**Goals**:

- seam の戻り値を判別共用体（DU）にし、「検査成功（paths）」と「検査不能（reason）」を型で分離する（G1）。
- local の `git status` 失敗（非ゼロ終了・spawn 例外・その他例外）を「検査不能」として返し、consumer が round を **escalation（fail-closed）** させる。検査できていない worktree を approved に落とさない（G2）。
- managed は挙動不変（`success:[]`）。local worktree が構造上存在しない managed の「変更なし」は検査失敗ではなく真の空である（G3）。
- port の doc comment を新 contract に更新し、「Never throws — returns [] on any error」の記述を除去する（G4）。
- 全実装・全 test fake・既存 test を新 DU に追随させる。`listWorktreeChanges` 未実装（method 省略）の fake が skip される既存挙動は維持する（G5）。

**Non-Goals**:

- `architecture/` 配下の変更。B-15 の §4 / conformance / 歯（`core-invariants.test.ts`）への反映は本 request の pipeline では行わず、実装 merge 後に attended で行う（trust-root を out-of-loop に保つ）。
- managed runtime の parallel custom reviewer サポート拡張（Non-Goal のまま）。managed は round を毎回 escalation させない。
- `commitRoundArtifacts` / `partitionRoundChanges` のロジック変更。両者は不変で、consumer の **呼び出し条件** のみ変える。
- port の ports→domain 依存の導入。error 情報は `reason: string` に限定し、`ErrorInfo`（domain）への写像は consumer 側で行う。

## Decisions

### D1 — seam の戻り値を判別共用体 `WorktreeInspectionResult` にする（G1 / G4）

`src/core/port/runtime-strategy.ts` に DU を定義・export する:

```
WorktreeInspectionResult =
  | { kind: "success"; paths: string[] }
  | { kind: "unavailable"; reason: string }
```

`RuntimeStrategy.listWorktreeChanges?(cwd): Promise<WorktreeInspectionResult>`（optional, port）/ `RealRuntimeStrategy.listWorktreeChanges(cwd): Promise<WorktreeInspectionResult>`（required, intersection）へ signature を変更する。doc comment（L405-424）の「Never throws — returns [] on any error」を新 contract に書き換える:

- 成功時は `{kind:"success", paths}`（paths は worktree 相対、追加・変更・削除・untracked を含む）。
- 検査不能時は `{kind:"unavailable", reason}`。
- throw しない点は維持する（DU を返すことで表現する）。

**Rationale**: `[]` は 3 状態（真の空 / 検査失敗 / worktree 不在）を潰しており、consumer が「検査不能」と「clean」を区別できないのが欠陥の根。戻り値を DU にすれば型レベルで区別が強制され、consumer は `kind` で網羅的に分岐せざるを得なくなる。error 情報を `reason: string` に限定することで、port から domain（`ErrorInfo` 等）への import を増やさず（既存の `unknown` 引数と同じ ports→domain 非依存方針）、runtime 固有のエラー詳細を平文で運べる。

**Alternatives considered**:

- *`null` を検査不能に使う（`Promise<string[] | null>`）*: `null` は意味が痩せており、reason（診断文字列）を運べない。escalation の message に写像する情報が失われる。却下。
- *例外を throw して consumer で catch する*: seam は「never-throw」を維持する契約で、既存 consumer は try/catch を持たない。throw 経路を新設すると pipeline の catch と二重になり、既存の他 seam（`listChangedFiles` 等）とも非対称。DU を返す方が最小。却下。
- *DU 型を domain（`src/state/` 等）に置く*: port が domain を import することになり ports→domain 非依存が崩れる。型は port 定義ファイル（`runtime-strategy.ts`）に置く。却下。

### D2 — local の検査失敗を `unavailable`、exit 0 を `success` にする（G2）

`LocalRuntime.listWorktreeChanges`（`local.ts:845`）:

- `git status` exit 0 → 従来どおり NUL パースし `{kind:"success", paths}`。
- exit 非ゼロ → `{kind:"unavailable", reason}`（reason に exit code を含める）。
- spawn 例外・その他例外（catch）→ `{kind:"unavailable", reason}`（reason にエラー概要を含める）。

パースロジック（`git status --porcelain -z --no-renames` の NUL 区切り、3 文字未満 skip）は不変。分岐する戻り値の wrap のみを変える。

**Rationale**: 検査できていない worktree を approved に落とさないのが本 request の主眼。`git status` の非ゼロ終了・spawn 失敗は「worktree の実状態が不明」であり、この未知状態を consumer に伝えて fail-closed（escalation）へ導く。reason は exit code / エラー概要という機械可読でない診断情報で、escalation の message に転写して人が worktree を検査できるようにする。

**Alternatives considered**:

- *非ゼロ終了だけ unavailable、spawn 例外は従来どおり `[]` 相当*: spawn 例外（git 不在等）こそ検査不能の典型で、ここを clean 扱いすると fail-open が残る。全失敗経路を unavailable に倒す。却下。

### D3 — managed は `success:[]` を維持する（G3）

`ManagedRuntime.listWorktreeChanges`（`managed.ts:560`）は `{kind:"success", paths:[]}` を返す（挙動不変）。`unavailable` にはしない。

**Rationale**: local worktree を持たない managed では「local worktree 変更なし」は検査失敗ではなく **構造上真の事実**であり、member も local worktree に書かない。local の `git status` 失敗（未知状態）と managed の worktree 不在（既知の空）は本質的に異なる。managed の parallel custom reviewer は Non-Goal のため、round を毎回 escalation させる必要はない。`listChangedFiles` の managed=`[]`（fail-safe）と同じ線引きを DU で明示的に表す。

**Alternatives considered**:

- *managed も `unavailable` にして round を毎回 escalation させる*: managed で custom reviewer 並列を回す運用自体が Non-Goal であり、既知の空を検査不能と偽って毎回 escalation させるのは過剰。member が local worktree に書かない以上、`success:[]` が真値。却下。

> この線引き（managed = `success:[]` を `unavailable` から分ける）が妥当かは spec-review で検証する（Open Questions 参照）。

### D4 — consumer は `unavailable` を escalation に、`success` を従来経路に写像する（G2 / G5）

`ParallelReviewRound.run`（`parallel-review-round.ts:222-259`）の worktree 検査ブロックを DU 分岐に変える:

- `deps.runtimeStrategy?.listWorktreeChanges` が存在すれば `inspection = await listWorktreeChanges(cwd)`。
- `inspection.kind === "unavailable"` → **round を escalation**:
  - `aggregateVerdictResult = "escalation"`。
  - `roundError = { code: "ROUND_INSPECTION_UNAVAILABLE", message, hint }`（`message` は `inspection.reason` を写像、`hint` は worktree 検査・git 復旧を促す操作上の手がかり）。
  - `commitRoundArtifacts` は **呼ばない**。
- `inspection.kind === "success"` → 従来どおり `partitionRoundChanges({changed: inspection.paths, declared, slug: deps.slug})` を通す（`offending` → `ROUND_NONDECLARED_CHANGE` escalation、`toStage` → `commitRoundArtifacts`）。既存挙動不変。
- `listWorktreeChanges` 不在（method 省略の test fake）→ 従来どおり検査・commit を skip（既存挙動維持）。

`roundError` は既存経路（synthetic coordinator `StepRun.outcome.error` ＋ `commitRound` 経由の `state.error`）でそのまま state に載る（`ErrorInfo` = `{code, message, hint}`）。写像（`reason: string` → `ErrorInfo`）は consumer 側に閉じ、port の ports→domain 非依存を保つ。

**Rationale**: escalation は SpecRunner の設計安全網であり、検査不能をここで止めるのが正しい。pipeline は `(coordinator, escalation)` に transition 行が無いため、既存の escalate 終端（awaiting-resume、reason は `state.error.message`）へ落ちる。新しい停止経路を作らず、`ROUND_NONDECLARED_CHANGE` と同じ escalation 機構に相乗りする最小手段。`success` 経路は変えないため宣言外変更検出・scoped commit の既存挙動が保たれる。

**Alternatives considered**:

- *`unavailable` を needs-fix にする*: needs-fix は fixer ループへ回るが、worktree 検査不能は fixer が自動で直せる問題ではない（git 環境 / worktree の破損）。人の介入を要する escalation が正しい。却下。
- *`unavailable` でも `commitRoundArtifacts` を best-effort で呼ぶ*: 検査できていない worktree に対する commit は宣言範囲を保証できず、fail-open を別経路で復活させる。commit は呼ばない。却下。

## Risks / Trade-offs

- **[Risk] 検査不能 escalation の頻発** → 一時的な git 失敗（ロック競合等）でも round が escalation で止まる。→ 検査できていない worktree を approved に落とすより、止めて resume で人が確認する方が安全（fail-closed の意図どおり）。reason を message に載せて診断可能にする。resume 時に worktree の全変更は commit されず保持される。
- **[Risk] test fake の追随漏れで runtime エラー** → 戻り値を `string[]` のまま返す fake が残ると、consumer の `inspection.kind` が `undefined` になり success/unavailable いずれの分岐にも入らず検査が空振りする。→ `grep -rn listWorktreeChanges src`（本 repo に top-level `tests/` ディレクトリは無く、test は `src/**/__tests__/` 配下）で全実装・全 fake を列挙し漏れなく DU へ更新する。method 省略の fake（skip 経路）は現状維持。
- **[Risk] managed の線引き誤り** → managed を `success:[]` にすることで、将来 managed が local worktree を持つ設計に変わった場合に検査失敗を見逃す。→ 現状 managed に local worktree は無く member も書かないため `success:[]` は真値。managed parallel は Non-Goal。線引きの妥当性は spec-review で検証する。
- **[Trade-off] port の DU 露出** → port が構造的 DU を返すことで consumer は `kind` 網羅分岐を強制される。これは意図した設計（型で検査不能の取りこぼしを防ぐ）であり、`reason: string` に限定して domain 依存は増やさない。

## Open Questions

- **managed = `success:[]` の線引き**: local の `git status` 失敗（`unavailable`）と managed の worktree 不在（`success:[]`）を分ける判断が妥当か。architect は「member が local worktree に書かない managed では変更なしが真値であり、Non-Goal の managed を毎回 escalation させる必要はない」と評価済みだが、この線引きは spec-review で検証する（request 明記）。それ以外は architect 評価済みの設計判断で確定。
