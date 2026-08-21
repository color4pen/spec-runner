# Design: bite-evidence の tamper 判定を「認可された変更経路」ベースに移行する

## Context

bite-evidence gate は `test-cases.md` の tamper 検査を持つ。現状の実装
(`src/core/step/bite-evidence/tamper.ts:37-74` `checkTamperStatus`) は、
events.jsonl の **test-case-gen** lineage record に凍結された `test-cases.md`
の hash と、現在の worktree ファイル hash を照合する:

- `match`      — 現在 hash == test-case-gen 凍結 hash → intact
- `mismatch`   — 現在 hash != 凍結 hash → tamper
- `inconclusive` — 凍結 hash 不在 → proceed

gate (`gate.ts:104-111`) は `mismatch` を `failed` (fail-closed) に写像する。

### 契約の正面衝突

一方、write-scope の設計 (`write-scope.ts:62-72` `protectedCanonPaths`) では
`test-cases.md` は保護正典であり、`spec-fixer`
(`spec-fixer.ts:99-107` の `writes()`) が正規の編集権限を所有する。
test-case-gen も `writes()` で `test-cases.md` を宣言する
(`test-case-gen.ts:74-76`)。spec-review が `test-cases.md` に fixable finding を
出すと spec-fixer が正規に編集し、その結果 worktree hash は test-case-gen 凍結
hash と必ず食い違う。現状の tamper 検査はこれを `mismatch` = tamper と誤認し、
**pipeline が正しく動くほど確実に bite-evidence で偽陽性 halt する**
（実測 1 件、台帳 issue #1036）。

### 証跡の耐久性

`appendLineage` (`commit-orchestrator.ts:269-291`) は best-effort で、
記録失敗を握りつぶす（「lineage recording failure must not affect step
completion」）。したがって lineage を tamper 判定の唯一の権威にすると、
「spec-fixer が正規編集したが lineage 記録だけ失敗した」run で証跡が欠落し、
偽陽性が残る。

一方、pipeline は sole-committer 設計であり、各 step の変更は executor が
step 名入り commit（`commit-push.ts:581` の `` `${step.name}: ${slug}` ``、
operator 適用は `apply-canon.ts:142` の `` `operator-apply: ${slug}` ``）として
branch に記録する。この commit 履歴は branch そのものであり **durable**
（lineage の best-effort とは独立に必ず残る）。

### 既存の provenance 判定の先例

`src/core/resume/canon-provenance.ts` は、apply-canon gate 用に
「dirty canon path が認可された step の `writes()` 宣言で説明できるか」を
pipeline descriptor + write-scope から導出する pure helper
(`declaredCanonWritesForStep`) を既に持つ。本 request はこの
「出自を descriptor から導出する」パターンを bite-evidence tamper に展開する。

## Goals / Non-Goals

**Goals**:

- tamper 判定を「現在の `test-cases.md` への変更が**認可された変更経路**で
  説明できるか」に変える。`writes()` で `test-cases.md` を所有する step
  (test-case-gen / spec-fixer) と operator 適用 (`operator-apply`) による変更を
  tamper としない。
- fail-closed を維持する。認可経路で説明できない変更（非所有 step の commit・
  証跡外の未 commit 書き換え）は引き続き `failed`。
- tamper 判定に使う証跡を **durable な sole-committer commit 履歴**に置き、
  best-effort な lineage 記録失敗が偽陽性を生まないようにする。
- 判定の内部語彙 (`TamperStatus = "match" | "mismatch" | "inconclusive"`) と
  gate の routing を安定に保ち、他 test を無変更で green のまま維持する。

**Non-Goals**:

- `test-cases.md` 以外の保護正典への tamper 検査の拡張。
- write-scope / spec-fixer の権限（所有宣言）の変更。
- bite-evidence の base/candidate 評価（strategy 選択・`runTestsOnSynthesizedTree`）
  側の変更。
- finding provenance（`--wontfix` の title drift、issue #1037）— 思想上の兄弟だが
  正本も壊れ方も異なるため別 request。共有するのは「出自を最初から運ぶ」原則のみ。

## Decisions

### D1: tamper 判定を content-identity から provenance（出自）へ移行する

「現在 hash が test-case-gen 凍結 hash と同一か」ではなく、「現在の
`test-cases.md` への**最新の変更が認可された出自を持つか**」を問う。
hash 照合は「凍結との一致」という判定基準から降格され、provenance 確認の
補助手段（worktree の未 commit drift 検出）に留まる。

判定は次の入力から純粋に決まる:

1. **authorizedWriters** — `test-cases.md` を `writes()` で宣言する step の
   名前集合（pipeline descriptor から導出）に、operator 適用トークン
   `operator-apply` を加えた集合。実運用では `{test-case-gen, spec-fixer,
   operator-apply}`。
2. **lastCanonCommitToken** — `test-cases.md` を最後に変更した commit の
   subject 先頭トークン（`<token>: <slug>` の `<token>`）。durable な git 履歴
   から取得。
3. **worktreeDirty** — `test-cases.md` に未 commit の worktree 変更があるか。
4. **evidenceAvailable** — runtime が git 由来の provenance を導出できるか。

分類:

- `evidenceAvailable == false` → `inconclusive`（proceed）
- `worktreeDirty == true` → `mismatch`（証跡外の書き換え → fail-closed）
- `lastCanonCommitToken == null`（commit 履歴なし）→ `inconclusive`（proceed）
- `lastCanonCommitToken ∈ authorizedWriters` → `match`（認可済み → proceed）
- それ以外（非所有 step の attribution）→ `mismatch`（fail-closed）

**Rationale**: architect 評価済みの「内容由来 identity から出自への移行が本
request の芯」を直接実装する。authorizedWriters を descriptor から導出すること
で、rules.md の「classification は tool が決定する」原則に沿い、将来の所有変更に
追随する（canon-provenance の先例と同型）。

**実装上の制約 — circular import 回避**: `authorizedCanonWriterSteps` helper の
配置は `tamper.ts` ではなく `src/core/resume/canon-provenance.ts`（または registry
の import chain 外の別モジュール）とする。`pipeline/registry.ts` は
`bite-evidence/step.ts` を import し（行 24）、`step.ts` は `tamper.ts` を import
するため、`tamper.ts` から `registry.ts` を import すると静的 circular import
（`registry → step → tamper → registry`）が生じる。`step.ts` も同様に
`registry.ts` を import できない。`canon-provenance.ts` は `core/resume/` に属し
registry の import chain 外にあるため cycle を持たない（`declaredCanonWritesForStep`
の先例と同一の状況）。`authorizedCanonWriterSteps` は descriptor の steps 配列を
引数で受け取る純粋関数として実装し、`registry.ts` を直接 import しない。
`step.ts` への配線は executor 層（`CliStepDeps.authorizedCanonWriters` フィールド
経由）で行い、executor は registry の import chain 外にあるため descriptor を
自由に参照できる。

**Alternatives considered**:

- **却下: test-case-gen と spec-fixer の 2 つの lineage hash 集合に照合する。**
  「現在 hash が test-case-gen または spec-fixer の lineage record hash の
  いずれかと一致すれば authorized」とする案。実装は小さいが、証跡が
  best-effort lineage に依存したまま（D2 で棄却）で、spec-fixer の lineage
  記録が失敗した run で偽陽性が残る。provenance ではなく content-identity の
  延命であり、request の芯に反する。
- **却下: authorizedWriters をコード内定数
  `{test-case-gen, spec-fixer, operator-apply}` にハードコードする。**
  最も単純だが、rules.md の「classification は tool が baseline/宣言から決定
  する」原則に反し、write-scope の所有宣言と二重管理になる。descriptor 導出
  なら所有の単一情報源に従える。定数化は operator 適用トークン `operator-apply`
  （commit 帰属であり step の `writes()` を持たない）に限定する。

### D2: 判定に使う証跡を durable な sole-committer commit 履歴にする

tamper 判定の権威を events.jsonl の lineage record（best-effort）ではなく、
branch の commit 履歴（durable）に置く。具体的には「`test-cases.md` を最後に
変更した commit の subject」を新 port method で取得し、その step 帰属トークンで
出自を分類する。

**Rationale**: 要件 3 の核心。`appendLineage` は
`commit-orchestrator.ts:269-291` で best-effort（記録失敗を握りつぶす）であり、
ADR「lineage recording failure must not affect step completion」により
その契約は維持すべき。lineage は journal-only（state.json に materialize
されない観測用信号）であり、これを gate の control-plane 権威に昇格させるのは
アーキテクチャ上の匂い。対して commit 履歴は sole-committer 設計により
「step の変更 = step 名入り commit」が保証され、lineage 記録の成否と独立に
必ず残る。よって「spec-fixer が正規編集 + lineage 記録だけ失敗」でも
`spec-fixer: <slug>` commit は durable に残り、authorized と正しく分類される。

**Alternatives considered**:

- **却下: `appendLineage` を durable 化（記録失敗を握りつぶさず step を止める）
  する。** tamper に必要な lineage record を確実に残すため、記録失敗を
  fatal にする案。ADR「lineage recording failure must not affect step
  completion」を破り、step 完了を journal I/O に結合させる。かつ既存 run の
  遡及救済にならず、journal-only 観測信号を control-plane に昇格させる匂いも
  残る。durable な証跡が**既に別に存在する**（commit 履歴）以上、best-effort の
  契約を壊す理由がない。

### D3: 証跡欠落時（導出不能）は inconclusive → proceed とする

git 由来の provenance を導出できない場合（`lastCommitTouchingPath` が
unavailable、`listWorktreeChanges` が unavailable、authorizedWriters が
導出できない、managed runtime で構造的に worktree が無い等）は `inconclusive`
として proceed する。既存の「凍結 hash 不在 → inconclusive → proceed」の
扱いを踏襲する。

**Rationale**: 要件 2 が明示を求める設計判断。fail-closed は「**積極的に
認可外と判定できた**変更」に限定する。導出不能（evidence が取れない）を
`failed` にすると、managed runtime や構造的に git 履歴を引けない環境で全 run が
halt する。tamper の芯は「認可外の書き換えを止める」ことであり、「証跡が
取れない」は認可外の証明ではない。よって導出不能は proceed（他の gate 判定に
委ねる）。なお D2 により、best-effort lineage の記録失敗はもはや「証跡欠落」を
引き起こさない（durable commit 履歴が残る）ため、要件 3 が懸念する偽陽性は
消える。

**Alternatives considered**:

- **却下: 導出不能を fail-closed (`failed`) にする。** 最も保守的だが、
  managed runtime を含む「git 履歴を引けない」全 run を偽陽性 halt させる。
  bite-evidence の base/candidate 評価自体が導出不能時に `strategy-deferred`
  で proceed する既存方針とも整合しない。

### D4: TamperStatus の内部語彙と gate routing を安定に保つ

`TamperStatus = "match" | "mismatch" | "inconclusive"` の union と、
gate の routing（`mismatch → failed`、`match`/`inconclusive → proceed`）を
そのまま維持する。変えるのは (a) `checkTamperStatus` の**計算方法**（provenance
分類）、(b) `gate.ts` の tamper reason 文字列（provenance を反映しつつ
`tamper` の語を残す）のみ。意味論を再解釈する:

- `match`      = 認可された出自（proceed）
- `mismatch`   = 認可外の出自（fail-closed）
- `inconclusive` = 判定不能（proceed）

**Rationale**: 受け入れ基準「gate.test.ts の『test-case-gen 固定基準』を pin
するケースに限り更新を許容、それ以外の既存テストは無変更で green」を満たす。
`evidence-base-gate.test.ts` / `gate-empty-selection.test.ts` は生の
`tamperStatus: "mismatch"` を gate に流し込み `verdict=failed` と
`reason).toMatch(/tamper/i)` のみを検証している。union と routing を安定に保ち、
reason に `tamper` の語を残せば、これらは無変更で green のまま。契約変更は
`checkTamperStatus` の signature（gate.test.ts の TC-032 が直接呼ぶ、更新許容
対象）と reason 文字列（`/tamper/i` を満たす）に閉じる。

**Alternatives considered**:

- **却下: union を `"authorized" | "unauthorized" | "inconclusive"` に改名する。**
  意味論は明快になるが、`evidence-base-gate.test.ts` 等が `"mismatch"` を
  リテラルで渡すため型エラー（無変更 green を破る）。受け入れ基準に反する。

### D5: durable 証跡取得用の port method を追加する

`RuntimeStrategy`（+ `RealRuntimeStrategy`）に、指定 path を最後に変更した
commit の OID と subject を返す method を追加する（例:
`lastCommitTouchingPath(path, cwd)`）。既存 port method の規約に倣う:

- 決して throw せず discriminated union を返す
  (`{ kind: "found"; oid; subject }` / `{ kind: "none" }` /
  `{ kind: "unavailable"; reason }`)。
- local: `git log -1 --format=<oid><US><subject> -- <path>` を cwd で実行
  （`<US>` = 区切り制御文字）。空出力 → `none`、非 0 exit / spawn error →
  `unavailable`。
- managed: 常に `unavailable`（local worktree 不在の構造的制約）。

worktree drift は既存 port method `listWorktreeChanges(cwd)` を再利用して
`test-cases.md` が未 commit 変更集合に含まれるかで判定する（新規追加不要）。

**Rationale**: `listCommitChangedFiles` / `readFileAtCommit` /
`readRevisionContent` と同じ port 拡張パターン。provenance 分類に必要な
durable 情報（最終変更 commit の帰属）だけを最小追加する。

**Alternatives considered**:

- **却下: `commitOid` を StepRun / synthesizedCommits ledger から引く。**
  state 由来の commitOid は step 実行時点の OID であり「その commit が
  `test-cases.md` を実際に変更したか」を語らない（implementer commit は
  test-cases.md を触らない）。「path を最後に変更した commit」を問うには
  git 履歴照会が必要。

## Risks / Trade-offs

- **[Risk] commit subject の解析が step トークン形式に依存する。**
  → subject は sole-committer が生成する `<step-name>: <slug>` /
  `operator-apply: <slug>` に固定（`commit-push.ts:581`,
  `apply-canon.ts:142`）。分類は先頭トークン（最初の `: ` より前）を用い、
  加えて `<slug>` 一致を検証して cross-slug 誤認を防ぐ。非準拠 subject が
  `test-cases.md` を変更していた場合は認可外 → `mismatch`（fail-closed、
  異常として正しい）。

- **[Risk] worktreeDirty を fail-closed にすると、正当な未 commit 状態を
  誤検出しうる。** → sole-committer 設計では bite-evidence 到達時点で全 step の
  出力は commit 済みであり、`test-cases.md` の未 commit 変更は本来発生しない。
  発生した場合は「証跡外の書き換え」＝ fail-closed が正しい（要件 2）。

- **[Risk] authorizedWriters を descriptor から導出する際、step.writes() の
  例外や step 不在で集合が空になると、正規編集も認可外と誤判定しうる。**
  → 導出が空/例外の場合は evidence 不十分として `inconclusive`（proceed）に
  倒す（fail-closed ではなく fail-open）。canon-provenance の
  `declaredCanonWritesForStep` が例外時 `[]` を返す方針と整合しつつ、
  bite-evidence では「authorizedWriters が導出できない = 判定不能」として
  D3 に合流させる。

- **[Trade-off] provenance は「最後に変更した commit」の 1 点のみを見る。**
  中間の非認可 commit を後続の認可 commit が上書きした履歴は authorized と
  なる。これは意図通り（sole-committer では最終出自が現内容を説明する）。

## Open Questions

- なし（本 request の設計判断は D1–D5 で確定）。ADR-worthy な設計判断（tamper の
  content-identity → provenance 移行、証跡の durable 化）の ADR 化は adr-gen step
  に委ねる（`request.adr === true`）。design/tasks では ADR の path を指定しない。
