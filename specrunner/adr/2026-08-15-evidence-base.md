# Evidence Base の導入: bite-evidence baseline を工程時系列から切り離す

**Date**: 2026-08-15
**Status**: accepted

## Context

bite-evidence の red→green 証明は、2 つの commit OID を工程時系列から解決していた
（`src/core/step/bite-evidence/oids.ts:resolveBaseCandidateOids`）:

- **base (red)** = 最新 `test-materialize` run の `commitOid`
- **candidate (green)** = 最新 `implementer` run の `commitOid`

「base = その時点の worktree tree」というモデルは resume・再走で 2 種類の壊れ方をする。

1. **再走汚染 (re-run contamination)**。`test-materialize` が `implementer` より後に走ると、
   test-materialize commit の tree には実装が含まれるため、tests が base で pass してしまい red を
   得られない。#991 は `detectBaseImplementationContamination`（startedAt 全順序）と gate step 3.5
   を追加し再走 shape を `strategy-deferred` に落とした。また archive floor P2.5 でその shape を
   `baseline unbuildable` として fail-closed にした。これは**検出**であって解決ではなく、混入した job は
   保証を得る手段を失う。
2. **operator commit 脱落 (operator commit drop-out)**。`resume --adopt-commits` は採択 commit を
   `synthesizedCommits` ledger に追記するだけで、`implementer` run の `commitOid` は更新しない。
   gate は implementer 時点の tree を green 判定の対象とするため、operator の修正が candidate から
   除外される。

`oids.ts` のponytail マーカー（"startedAt 全順序に依存。Evidence Base 導入時に tree 合成へ置換"）が
本変更の前登録された forward pointer である。

## Decision

### D1: Job base = 最初の synthesized commit の first parent

immutable な job base は `<synthesizedCommits[0]>^`（bootstrap commit の first parent）として解決する。
この revision expression を返す純粋ヘルパー `resolveEvidenceBaseRev(state): string | null` を
`oids.ts` に追加する。ledger が空または absent のとき `null` を返す。

**採択理由**: fork point は「job 開始時点の base branch tree」と定義上一致する。
`synthesizedCommits[0]`（bootstrap commit）は branch-borne に永続化されており、resume を跨いで
journal fold でそのまま残る。commit の first parent は immutable であるため、初回走行でも再走でも
同一 tree に解決される。新しい state field・write path・schema 変更が一切不要であり、既存データから
導出できる。

**対案**:

- *`jobBaseOid` field を job state に記録する（workspace materialization 時に書き込む）*。
  明示的だが、schema field・write site・legacy-absent のフォールバック分岐が増える。既に永続化済みの
  anchor から導出できるため不要と判断し却下。
- *gate 実行時に `origin/<base-branch>` を参照する*。job 開始後に base branch が進んでいると drift し、
  resume-stable でない。却下。

**fail-closed**: 空/absent ledger → `null` → `strategy-deferred`（gate）/ dimension absent（floor）。

### D2: Evidence Base red = 合成 tree 上でのテスト実行

新しいランタイムポートメソッド `runTestsOnSynthesizedTree(baseRev, overlayFiles, overlayFromOid, cwd, config)`
を追加する。base revision を detached worktree に checkout し、各 overlay path のコンテンツを
`overlayFromOid` から読んで上書きし、`node_modules` を symlink し、ファイルごとに scoped test を
実行して cleanup する。戻り値は既存の `IsolatedTestResult` DU。`scopedTestCommand` 未設定の場合は
`unavailable`（既存 gate の defer 契約と同じ）。

**採択理由**: 既存の `runTestsAtCommit` 実装（detached worktree + symlink + per-file scoped run +
finally cleanup）の最小拡張。`scopedTestCommand` の優先順位・never-throw `unavailable` 契約・
managed runtime stub パターンをそのまま再利用する。ポートメソッドは意図的に汎用（base rev + overlay）
であり、「job base」「candidate」という policy は gate/floor が持つ。

**対案**:

- *`read-tree` + `update-index` + `write-tree` で実際の git tree オブジェクトを合成して checkout*。
  テスト実行の結果は等価だが plumbing が増える。laziness 原則で却下。

**例外 (capability contract)**: `scopedTestCommand` 未設定 → `unavailable`。managed runtime →
`unavailable`。non-existent `baseRev` → `unavailable`（never throws）。

### D3: materialized test ファイルのセットは引き続き最新 test-materialize commit から同定する

overlay・実行対象のファイルパス集合は `listCommitChangedFiles(latestTestMaterializeOid)` +
`selectMaterializedTestFiles` で取得する。この部分は変更しない。

**採択理由**: `test-materialize` はテストファイルのみを書く責務を持つため、その commit diff が
materialized test set となる。セットの意味は時系列に依存せず（「今回 materialize されたテスト」）、
base tree を D1 から、overlay content を D2 の `overlayFromOid`（HEAD）から取得するため、
test-materialize commit の tree の実装が漏れ込む経路がない。`resolveBaseCandidateOids` は
`test-materialize` の OID 取得のために保持し、その pinning test (`oid-capture.test.ts`) は無変更。

**既知残存リスク (R1)**: `test-materialize` が複数回走り後の run で一部ファイルのみ更新した場合、
最新 commit diff にはそのサブセットしか含まれない。本変更の導入ではなく既存の制限であり、
`test-materialize` を `implementer` に統合する後続 request で解決する。

### D4: green candidate = effective branch HEAD（provenance 承認済みの到達 tree）

gate の green candidate を `captureHeadSha(cwd)`（branch HEAD）で解決する。archive floor の
candidate は既に `finalHeadOid`（HEAD 相当）であり変更なし。

**採択理由**: "provenance が承認した到達 tree" = branch HEAD。`--adopt-commits` で採択された
operator commit は branch 上の real commit であり、HEAD は自動的にそれらを包含する。stale な
`implementer.commitOid` は包含しない。HEAD が承認済み commit のみを含むかの検証は、adopt gate
（resume）と egress backstop（push）が fail-closed で担保しており、bite-evidence はその境界に
依拠して重複チェックをしない。

**対案**:

- *adopt 時に `implementer.commitOid` を更新する*。adopt は provenance act であり implementer
  re-run ではない。step 記録の OID を上書きすると他の消費者が読む chronology が壊れる。却下。

**fail-closed**: `captureHeadSha` → `null` → `strategy-deferred`。

### D5: 時系列依存機構を撤去し、archive floor base-red を Evidence Base に再構築する

`detectBaseImplementationContamination`（`oids.ts`）、gate step 3.5（`gate.ts:119-129`）、
archive floor P2.5（`achieved-assurance.ts:236-246`）を削除する。
archive floor の base-red 実行（`runTestsAtCommit(baseOid)`）を
`runTestsOnSynthesizedTree(evidenceBaseRev, testFiles, finalHeadOid)` に置き換える。
blob-freeze (b)・scenario-freeze (c)・HEAD-green (f) は変更しない。

**採択理由（検出より構成）**: Evidence Base により base への実装混入が構成上起き得なくなるため、
検出機構は dead weight であり二重管理になる。P2.5 を残しつつ base-red を Evidence Base に移さない場合、
汚染された test-materialize tree は P2.5 ではなく base-red で落ちるだけで、再走 job が保証を得られない
状況は変わらない。archive floor を Evidence Base ベースにすることが変更の実質であり、gate と対称である。

**対案**:

- *P2.5 を belt-and-braces として Evidence Base と並存させる*。Evidence Base により汚染が構成上不可能に
  なった後は、P2.5 は偽陽性またはデッドパスでしか発火しない。2 つの真理源が同一不変条件に存在する状態は
  保守リスクのみを残す。却下。

### D6: strategy-deferred / tamper / type / never-throw 不変条件をすべて維持する

gate の short-circuit 順序: 非 forward type → tamper mismatch → absent materialize OID →
absent Evidence Base ref → runtime capability missing → empty selection。これらはすべて
HEAD 取得・テスト実行より前に短絡する。`FORWARD_TYPES`・tamper check・managed / `scopedTestCommand`
未設定の `unavailable` → `strategy-deferred` マッピング・never-throw ラッパーは不変。

## Alternatives Considered

### Alternative 1: Evidence Base reference を新規 state field に書く

設計 D1 の対案。workspace materialization 時に `jobBaseOid` を state に永続化する案。

- **Pros**: 明示的で自己記述的
- **Cons**: schema field・write site・legacy migration の 3 点が増える。`synthesizedCommits[0]^` から
  無コストで同じ tree を得られるため冗長
- **Why not**: 既存データから正確に導出できる場合に新規書き込みを増やすのは over-engineering

### Alternative 2: 合成 git tree オブジェクトを作って checkout する

設計 D2 の対案。`git read-tree` + `git write-tree` で実際の tree object を作成して checkout する案。

- **Pros**: git の内部モデルと整合
- **Cons**: `update-index` / `write-tree` / `commit-tree` のラウンドトリップが増える。テスト実行の
  観測可能な結果は file-overlay と等価
- **Why not**: YAGNI。file-overlay がより単純で目的を満たす

### Alternative 3: adopt 時に `implementer.commitOid` を更新する

設計 D4 の対案。`resume --adopt-commits` が採択 commit を ledger に追記する際、`implementer` run の
`commitOid` もその採択 HEAD に更新することで、green candidate が operator commit を包含するようにする案。

- **Pros**: green candidate の解決を既存の step record ベースのまま維持できる
- **Cons**: adopt は provenance act であり implementer の再実行ではない。step 記録の OID を上書きすると、
  `implementer` run の chronology を読む他の消費者（conformance・usage 集計等）が壊れる。
  また step record と branch HEAD を二重管理することになり、ずれた場合の正典が不明確になる
- **Why not**: candidate の正典を「step が記録した OID」から「branch HEAD」に一本化する方が
  provenance モデルと整合する。step record の改ざんは別の問題を生む

### Alternative 4: `detectBaseImplementationContamination` を Evidence Base と並存させる

設計 D5 の対案。Evidence Base 導入後も汚染検出を belt-and-braces として残す案。

- **Pros**: 「念のため」の安全網
- **Cons**: Evidence Base 下では汚染は構成上不可能なので検出は偽陽性またはデッドパスしか生じない。
  同一不変条件に 2 つの実施機構が存在することは保守負債になる
- **Why not**: dead code を残すコストに対してゼロのメリット

## Consequences

### Positive

- 再走 shape（`test-materialize` が `implementer` より後に走った state）が `strategy-deferred` でなく
  保証を得られるようになる。#991 で止血していた形が修復される。
- `--adopt-commits` で採択された operator commit が bite-evidence の candidate に含まれる。
- resume・再走・複数回の `test-materialize` 実行に対して Evidence Base が同一 tree に解決される
  （時系列非依存の意味論）。
- `detectBaseImplementationContamination`・gate step 3.5・archive floor P2.5 の削除により、
  同一不変条件の二重管理が解消される。

### Negative

- `runTestsOnSynthesizedTree` の追加により、新しいランタイム実装を追加する際に no-op stub が
  1 メソッド増える。
- archive floor の base-red が Evidence Base に移ったことで、`biteEvidence` に関わるテスト全体で
  fake の migration が発生した（design D7 に列挙）。Evidence Base の substantive な修正に伴う必然的な
  変更であり、anti-regression assertion（#848 / hollow / unavailable）は保持されている。

### Known Debt

- **R1: 複数回 test-materialize 時のファイルセット同定**。最新 commit diff のみを参照するため、
  後続の partial re-materialize がある場合に前の run で追加されたテストファイルが漏れる。
  pre-existing limitation であり `test-materialize` を `implementer` に統合する後続 request で対処する。
- **R4: 新規 module 型での red 証明力**。Evidence Base 上で新規 module の test を実行すると import error
  で red になる（「実装が無いから落ちた」以上の証明ができない）。hollow 検出の解像度が高いのは
  「既存 module の挙動変更」型のみ。本変更のスコープ外（証明力上限は現行と同じ）。

## References

- Request: `specrunner/changes/evidence-base/request.md`
- Design: `specrunner/changes/evidence-base/design.md`
- Spec: `specrunner/changes/evidence-base/spec.md`
- Related: #991（汚染検出の止血・本変更の起点）
- Implementation: `src/core/step/bite-evidence/oids.ts`・`src/core/step/bite-evidence/gate.ts`・`src/core/archive/achieved-assurance.ts`・`src/core/runtime/local.ts`・`src/core/port/runtime-strategy.ts`
