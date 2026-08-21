# bite-evidence tamper 判定を content-identity から provenance（出自）ベースに移行する

**Date**: 2026-08-21
**Status**: accepted

## Context

bite-evidence gate は `test-cases.md` の tamper 検査を持つ。実装前の検査
（`src/core/step/bite-evidence/tamper.ts` の `checkTamperStatus`）は、
events.jsonl の **test-case-gen** lineage record に凍結された `test-cases.md` hash と
現在の worktree ファイル hash を照合する content-identity モデルだった:

- `match`      — 現在 hash == test-case-gen 凍結 hash → intact
- `mismatch`   — 現在 hash != 凍結 hash → tamper（fail-closed）
- `inconclusive` — 凍結 hash 不在 → proceed

### 契約の正面衝突

write-scope の設計では `test-cases.md` は保護正典であり、`spec-fixer`（`spec-fixer.ts`
の `writes()`）が正規の編集権限を所有する。spec-review が `test-cases.md` に fixable
finding を出すと spec-fixer が正規に編集し、worktree hash は test-case-gen 凍結 hash と
必ず食い違う。旧 tamper 検査はこれを `mismatch` = tamper と誤認し、**pipeline が正しく
動くほど確実に bite-evidence で偽陽性 halt する**（実測 1 件、issue #1036）。

「test-case-gen 時点と同一か」ではなく「現在の変更は認可された経路で説明できるか」を
問うべきである、という認識が本変更の起点。

### 証跡の耐久性の問題

`appendLineage`（`commit-orchestrator.ts`）は best-effort で、記録失敗を握りつぶす
（ADR「lineage recording failure must not affect step completion」）。したがって
lineage を tamper 判定の唯一の権威にすると、「spec-fixer が正規編集したが lineage 記録
だけ失敗した」run で証跡が欠落し偽陽性が残る。

一方、pipeline は sole-committer 設計であり、各 step の変更は executor が step 名入り
commit（`spec-fixer: <slug>`・`operator-apply: <slug>` 等）として branch に記録する。
この commit 履歴は branch そのものであり **durable**（lineage best-effort と独立に残る）。

## Decision

### D1: tamper 判定を content-identity から provenance（出自）へ移行する

「現在 hash が test-case-gen 凍結 hash と同一か」ではなく、「`test-cases.md` への
**最新の変更が認可された出自を持つか**」を問う。hash 照合は「凍結との一致」という
判定基準から降格され、worktree の未 commit drift 検出の補助手段に留まる。

判定は次の入力から純粋に決まる:

1. **authorizedWriters** — `test-cases.md` を `writes()` で宣言する step の名前集合
   （pipeline descriptor から導出）に、operator 適用トークン `operator-apply` を加えた集合。
   実運用では `{test-case-gen, spec-fixer, operator-apply}`。
2. **lastCanonCommitToken** — `test-cases.md` を最後に変更した commit の subject 先頭
   トークン（`<token>: <slug>` の `<token>`）。durable な git 履歴から取得。
3. **worktreeDirty** — `test-cases.md` に未 commit の worktree 変更があるか。
4. **evidenceAvailable** — runtime が git 由来の provenance を導出できるか。

分類:

| 条件 | TamperStatus | Gate 結果 |
|------|-------------|----------|
| `evidenceAvailable == false` | `inconclusive` | proceed |
| `worktreeDirty == true` | `mismatch` | failed（fail-closed）|
| `lastCanonCommitToken == null`（commit 履歴なし） | `inconclusive` | proceed |
| `lastCanonCommitToken ∈ authorizedWriters` | `match` | proceed |
| それ以外（非所有 step の attribution） | `mismatch` | failed（fail-closed）|

**採択理由**: architect 評価済みの「内容由来 identity から出自への移行が本 request の芯」を
直接実装する。authorizedWriters を descriptor から導出することで、rules.md の
「classification は tool が決定する」原則に沿い、将来の所有変更に追随する
（`canon-provenance.ts` の `declaredCanonWritesForStep` と同型）。

**却下案**:
- *test-case-gen と spec-fixer の 2 つの lineage hash 集合に照合する*。証跡が
  best-effort lineage に依存したまま（D2 で棄却理由と同じ）。provenance ではなく
  content-identity の延命であり、request の芯に反する。
- *authorizedWriters をコード内定数にハードコードする*。write-scope の所有宣言と
  二重管理になり、rules.md 原則に反する。定数化は `operator-apply` トークン（step の
  `writes()` を持たない commit 帰属）に限定する。

### D2: 判定証跡を durable な sole-committer commit 履歴に置く

tamper 判定の権威を events.jsonl の lineage record（best-effort）ではなく、branch の
commit 履歴（durable）に置く。「`test-cases.md` を最後に変更した commit の subject」を
新 port method `lastCommitTouchingPath` で取得し、step 帰属トークンで出自を分類する。

**採択理由**: `appendLineage` は best-effort であり ADR 上その契約は維持すべき。lineage
は journal-only（state.json に materialize されない観測用信号）であり、これを gate の
control-plane 権威に昇格させるのはアーキテクチャ上の匂い。commit 履歴は sole-committer
設計により「step の変更 = step 名入り commit」が保証され、lineage 記録の成否と独立に
必ず残る。「spec-fixer が正規編集 + lineage 記録だけ失敗」でも `spec-fixer: <slug>`
commit は durable に残り、authorized と正しく分類される。

**却下案**: *`appendLineage` を durable 化（記録失敗を fatal にする）*。ADR
「lineage recording failure must not affect step completion」を破り、step 完了を
journal I/O に結合させる。durable な証跡が既に別に存在する（commit 履歴）以上、
best-effort 契約を壊す理由がない。

### D3: 証跡欠落時（導出不能）は inconclusive → proceed とする

git 由来の provenance を導出できない場合（`lastCommitTouchingPath` が unavailable、
`listWorktreeChanges` が unavailable、authorizedWriters が導出できない、managed runtime
で構造的に worktree が無い等）は `inconclusive` として proceed する。

**採択理由**: fail-closed は「**積極的に認可外と判定できた**変更」に限定する。
導出不能（evidence が取れない）を `failed` にすると、managed runtime や構造的に
git 履歴を引けない環境で全 run が halt する。tamper の芯は「認可外の書き換えを止める」
ことであり、「証跡が取れない」は認可外の証明ではない。D2 により、best-effort lineage
の記録失敗はもはや「証跡欠落」を引き起こさない（durable commit 履歴が残る）ため、
要件が懸念する偽陽性は消える。

**却下案**: *導出不能を fail-closed にする*。managed runtime を含む「git 履歴を引けない」
全 run を偽陽性 halt させる。bite-evidence の base/candidate 評価自体が導出不能時に
`strategy-deferred` で proceed する既存方針とも整合しない。

### D4: TamperStatus の内部語彙と gate routing を安定に保つ

`TamperStatus = "match" | "mismatch" | "inconclusive"` の union と、gate の routing
（`mismatch → failed`、`match` / `inconclusive → proceed`）をそのまま維持する。
変えるのは (a) `checkTamperStatus` の**計算方法**（provenance 分類）、(b) gate の
tamper reason 文字列（provenance を反映しつつ `tamper` の語を残す）のみ。
意味論を再解釈する:

- `match`        = 認可された出自（proceed）
- `mismatch`     = 認可外の出自（fail-closed）
- `inconclusive` = 判定不能（proceed）

**採択理由**: `evidence-base-gate.test.ts` / `gate-empty-selection.test.ts` は生の
`tamperStatus: "mismatch"` を gate に流し込み `verdict=failed` と
`reason).toMatch(/tamper/i)` のみを検証している。union と routing を安定に保ち、
reason に `tamper` の語を残せば、これらは無変更で green のまま。受け入れ基準
「gate.test.ts の『test-case-gen 固定基準』を pin するケースに限り更新を許容、
それ以外の既存テストは無変更で green」を満たす。

**却下案**: *union を `"authorized" | "unauthorized" | "inconclusive"` に改名する*。
意味論は明快になるが、`evidence-base-gate.test.ts` 等が `"mismatch"` をリテラルで渡す
ため型エラー（無変更 green を破る）。受け入れ基準に反する。

### D5: durable 証跡取得用の port method `lastCommitTouchingPath` を追加する

`RuntimeStrategy`（+ `RealRuntimeStrategy`）に、指定 path を最後に変更した commit の
OID と subject を返す method を追加する。

- 決して throw せず discriminated union を返す
  (`{ kind: "found"; oid; subject }` / `{ kind: "none" }` / `{ kind: "unavailable"; reason }`)。
- local: `git log -1 --format=<oid><US><subject> -- <path>` を cwd で実行。
  空出力 → `none`、非 0 exit / spawn error → `unavailable`。
- managed: 常に `unavailable`（local worktree 不在の構造的制約）。

**採択理由**: `listCommitChangedFiles` / `readFileAtCommit` / `readRevisionContent` と
同じ port 拡張パターン。provenance 分類に必要な durable 情報（最終変更 commit の帰属）
だけを最小追加する。worktree drift 検出は既存 `listWorktreeChanges` を再利用。

**却下案**: *`commitOid` を StepRun / synthesizedCommits ledger から引く*。state 由来の
commitOid は step 実行時点の OID であり「その commit が `test-cases.md` を実際に変更
したか」を語らない（implementer commit は test-cases.md を触らない）。「path を最後に
変更した commit」を問うには git 履歴照会が必要。

### D6: authorizedCanonWriterSteps の配置を canon-provenance.ts にする

`authorizedCanonWriterSteps` helper は `tamper.ts` ではなく
`src/core/resume/canon-provenance.ts` に置く。

**採択理由**: `pipeline/registry.ts` は `bite-evidence/step.ts` を import し（行 24）、
`step.ts` は `tamper.ts` を import するため、`tamper.ts` から `registry.ts` を import
すると静的 circular import（`registry → step → tamper → registry`）が生じる。
`canon-provenance.ts` は `core/resume/` に属し registry の import chain 外にあるため
cycle を持たない（`declaredCanonWritesForStep` の先例と同一の状況）。helper は
descriptor の steps 配列を引数で受け取る純粋関数として実装し、`registry.ts` を直接
import しない。

`step.ts` への配線は `src/core/types.ts` の `PipelineDeps` にフィールドを追加し、
`src/core/pipeline/run.ts` の `buildPipelineForJob` 内で注入する。`buildPipelineForJob`
は descriptor を内部解決する唯一の場所であり、`canon-provenance.ts` を安全に import
できる（`run.ts` は registry の import chain 外）。

## Alternatives Considered

### Alternative 1: test-case-gen と spec-fixer の lineage hash 集合に照合する

「現在 hash が test-case-gen または spec-fixer の lineage record hash のいずれかと
一致すれば authorized」とする案。content-identity モデルを複数 lineage record に拡張する。

- **Pros**: 実装変更が小さい。`checkTamperStatus` の構造を維持したまま authorized 集合を
  広げるだけで対応できる。
- **Cons**: 証跡が best-effort lineage に依存したまま。「spec-fixer が正規編集 + lineage
  記録だけ失敗」run では証跡が欠落し偽陽性が残る。provenance ではなく content-identity
  の延命であり、「hash が同じか」という問い自体は変わらない。
- **Why not**: D2 で採択した durable commit 履歴ベースの設計と組み合わせても lineage
  依存が消えない。request の芯「内容由来 identity から出自への移行」に反し、問題の
  根本解決にならない。

### Alternative 2: appendLineage を durable 化する（記録失敗を fatal にする）

`appendLineage` の best-effort 契約を破棄し、lineage 記録失敗を step 完了の致命エラー
にする案。lineage を tamper 判定の権威のまま維持し、記録欠落を構造的に除去する。

- **Pros**: lineage を tamper 判定の唯一の権威として維持でき、「spec-fixer が正規編集した
  が lineage だけ失敗」シナリオが構造的に起きなくなる。
- **Cons**: 既存 ADR「lineage recording failure must not affect step completion」を破る。
  step 完了を journal I/O に結合させ、journal 障害がすべての step を止める。既存 run
  の遡及救済にならない。lineage は journal-only の観測用信号であり、これを gate の
  control-plane 権威に昇格させるのはアーキテクチャ上の匂い。
- **Why not**: durable な証跡（commit 履歴）が既に独立して存在するため、best-effort 契約を
  壊す理由がない。証拠の種別を変える（lineage → commit 履歴）方が、既存契約を維持
  しながら偽陽性を除去できる。

### Alternative 3: 証跡が導出できない場合を fail-closed にする

git 由来の provenance が取得できないとき（managed runtime、git 照会エラー等）を
`failed`（fail-closed）にする案。

- **Pros**: 最も保守的。証跡が取れない場合も安全側に倒す。
- **Cons**: managed runtime を含む「git 履歴を引けない」環境の全 run が halt する。
  bite-evidence の base/candidate 評価が導出不能時に `strategy-deferred` で proceed する
  既存方針と整合しない。「証跡が取れない」を「認可外の証明」と同一視することになり
  論理的に正しくない。
- **Why not**: fail-closed の境界は「積極的に認可外と判定できた変更」に限定すべき。
  D2 により best-effort lineage の失敗はもはや「証跡欠落」を引き起こさないため、
  残る導出不能ケースは「evidence が構造的に取れない環境」のみであり、proceed が正しい。

### Alternative 4: TamperStatus union を新語彙（authorized / unauthorized / inconclusive）に改名する

`TamperStatus = "authorized" | "unauthorized" | "inconclusive"` に改名し、
provenance モデルの意味論を型レベルで明示する案。

- **Pros**: 意味論が型から自明になり、「hash 照合」のニュアンスが消える。
  読み手に provenance ベースの設計を直接伝えられる。
- **Cons**: `evidence-base-gate.test.ts` / `gate-empty-selection.test.ts` が
  `"mismatch"` リテラルを直接渡しており、型エラーで既存テストが壊れる。
  受け入れ基準「それ以外の既存テストは無変更で green」に反する。
- **Why not**: 契約変更を `checkTamperStatus` の signature と reason 文字列に閉じることで、
  既存テストを無変更で green のまま維持できる。語彙の安定を選び、意味論の再解釈で
  provenance モデルを表現する（D4）。

### Alternative 5: commitOid を StepRun / synthesizedCommits ledger から引く

state.json に記録された step run の `commitOid` を読み出し、spec-fixer の commit OID と
現在の HEAD を照合する案。git 履歴照会を回避して state から解決する。

- **Pros**: git コマンド不要。state.json は既存の読み取りパターンで参照できる。
- **Cons**: state 由来の `commitOid` は step 実行時点の OID であり「その commit が
  `test-cases.md` を実際に変更したか」を語らない（implementer commit は test-cases.md
  を触らない）。commit OID が分かっても「そのコミットがどのファイルを変更したか」は
  別途 git 照会が必要。
- **Why not**: 「`test-cases.md` を最後に変更した commit の帰属」を問うには git 履歴照会が
  本質的に必要。ledger は経路を証明しない。

## Risks / Trade-offs

- **[Risk] commit subject の解析が step トークン形式に依存する**。subject は
  sole-committer が生成する `<step-name>: <slug>` / `operator-apply: <slug>` に固定
  （`commit-push.ts`・`apply-canon.ts`）。分類は先頭トークン（最初の `: ` より前）を
  用い、`<slug>` 一致を検証して cross-slug 誤認を防ぐ。非準拠 subject が
  `test-cases.md` を変更していた場合は認可外 → `mismatch`（fail-closed、異常として
  正しい）。

- **[Risk] worktreeDirty を fail-closed にすると正当な未 commit 状態を誤検出しうる**。
  sole-committer 設計では bite-evidence 到達時点で全 step の出力は commit 済みであり、
  `test-cases.md` の未 commit 変更は本来発生しない。発生した場合は「証跡外の書き換え」
  ＝ fail-closed が正しい。

- **[Trade-off] provenance は「最後に変更した commit」の 1 点のみを見る**。中間の
  非認可 commit を後続の認可 commit が上書きした履歴は authorized となる。これは意図通り
  （sole-committer では最終出自が現内容を説明する）。

- **[Trade-off] `authorizedCanonWriters` が導出できない場合（空/例外）は inconclusive
  に倒す**。fail-closed ではなく fail-open。canon-provenance の `declaredCanonWritesForStep`
  が例外時 `[]` を返す方針と整合し、「authorizedWriters が導出できない = 判定不能」
  として D3 に合流させる。

## Consequences

### Positive

- spec-review → spec-fixer の正規編集経路で偽陽性 halt しなくなる（issue #1036 解決）。
- `appendLineage` best-effort 失敗が tamper 偽陽性を引き起こさなくなる。
- authorizedWriters を descriptor から導出するため、write-scope の所有宣言が
  単一情報源となり、将来の所有変更に追随する。
- `TamperStatus` union と gate routing の安定により、既存テストを無変更で green のまま
  維持する。

### Negative

- `lastCommitTouchingPath` の追加により、RuntimeStrategy を実装するテストダブルに
  no-op stub が 1 メソッド増える。
- commit subject の先頭トークン解析が sole-committer のフォーマット規約に結合する。
  フォーマットを変更する場合は tamper 判定への影響を確認する必要がある。

### Known Debt

- `test-cases.md` 以外の保護正典（spec.md 等）への provenance ベース tamper 検査への
  拡張は Non-Goal として留保。拡張する場合は同一パターンを適用できる。
- finding provenance（`--wontfix` の title drift、issue #1037）は思想上の兄弟だが
  修正する正本も壊れ方も異なるため別 request とする。共有するのは「出自を最初から
  運ぶ」原則のみ。

## References

- Request: `specrunner/changes/tamper-provenance-baseline/request.md`
- Design: `specrunner/changes/tamper-provenance-baseline/design.md`
- Spec: `specrunner/changes/tamper-provenance-baseline/spec.md`
- Issue: #1036（偽陽性 halt の台帳）
- Related: `src/core/resume/canon-provenance.ts`（`declaredCanonWritesForStep` の先例）
- Related: `src/core/step/bite-evidence/tamper.ts`（実装）
- Related: `src/core/port/runtime-strategy.ts`（`lastCommitTouchingPath` port）
- Related: [ADR-20260815-evidence-base](2026-08-15-evidence-base.md) — bite-evidence baseline の Evidence Base 移行（tamper check は本 ADR）
