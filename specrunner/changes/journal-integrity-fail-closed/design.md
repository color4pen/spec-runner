# Design: journal-integrity-fail-closed

## Context

`events.jsonl`（event journal）は architecture/domain-model.md が定める append-only の
truth であり、`state.json`（projection）はその fold で再構成できる cache にすぎない。
現行実装はこの truth の欠損を検出できない:

1. `fold()`（`src/store/event-journal.ts:148-259`）は末尾 partial 行の drop（162-179）とは別に、
   ループ内で中間行の `JSON.parse` 失敗を `continue` で silent skip する（189-193、コメント
   「Skip malformed line (not just tail)」）。JSON として parse できるが object でない行も
   silent skip（196）。step attempt / transition が欠けた fold 結果が、そのまま resume・routing・
   projection 再構成に流れる。
2. `persist()`（`src/store/job-state-store.ts:441-530`）の delta 計算は、fold 結果が state.json 側
   `_journal` counters を下回っても `Math.max`（502）と `mergeStepCountsMax`（503）で吸収する。
   journal が外部要因で切り詰められていても検出されない。

「journal = 再計算可能な事実」はロードマップの attestation 線（journal 再 fold による verdict
再導出・第三者監査）の前提であり、欠損が黙殺される現状ではその前提が立たない。本 change は
truth の欠損を **検出して fail-closed にする** ことに限定する。

### 現状コードの前提

- `fold()` は `FoldResult` を返す純関数で、既存の全 caller（`job-state-store` の load/persist、
  `cli/job-show.ts:170` の lineage 表示、複数の unit test）が **throw しない** ことに依存している。
  既知 type 以外の object record は forward compat として無視される（213 のコメント、
  `artifact-observability.test.ts` が固定）。
- `appendEventRecord()`（273-280）は `fs.appendFile` のみ（設計 D3: no reads, no rewrites）。
  delta append は「events.jsonl に append してから state.json の `_journal` counters を atomic 書き
  換え」の順で行われるため、正しい運用では常に `journal 件数 ≥ 記録済み counters` が成立する。
- `JobStateStore.load()` は `loadSplitLayout()`（636-730）に委譲する。この関数は `list()`（210-358）
  の 5 箇所、`loadStateByJobId()`（`src/core/job-access/load-by-job-id.ts`）からも共有される。
  `loadStateByJobId` は resume / finish / cancel の consume 経路が使う。
- `persist()` は fast path（476-482: stored counters が in-memory 件数を満たすとき fold を省略）と、
  fold 経路（486-530: crash recovery のため journal を再 fold）を持つ。
- `cli/job-show.ts` は UUID 入力で `loadStateByJobId`、slug 入力で `JobStateStore.list()` から
  header 用の state を得て、`printJobState()` が changeDir を解決し `fold()` で lineage / usage.json で
  cost を表示する（読み取り専用）。
- `src/core/doctor/checks/` は runtime / config / env / auth / repo / agents / storage の 7 カテゴリ。
  storage 配下の scan 系 check（orphan-worktrees / orphan-sidecars）は「default scan を注入で
  差し替え可能にする factory」パターン（`createOrphanWorktreesCheck(overrideScan?)`）を採る。
- `src/errors.ts` は `SpecRunnerError` + `ERROR_CODES` + factory 関数（例 `stateFileInvalidError`）が
  error 表現の慣例。exit code は `EXIT_CODE_MAP` 未登録なら GENERAL_ERROR(1)。

## Goals / Non-Goals

**Goals**:

- `fold()` が「許容される末尾 partial」と「中間破損」を区別し、破損を throw せず `FoldResult` の
  フィールドとして呼び出し元に **報告** する。
- consume 経路（`load()` / `persist()`）が中間破損を検出したら専用 error code の `SpecRunnerError` で
  **fail-closed** する。`persist()` は fold 結果が stored counters を下回る「切り詰め」も同じ error で
  fail する（現行の max() 吸収を廃止）。
- 末尾 partial の drop（crash 正常系）は従来どおり許容する。journal なし / 空 / 末尾 partial のみは
  破損扱いしない。既知 type 以外の object record は forward compat 維持。
- `job show` は破損 journal で crash せず corruption を明示する（読み取り専用の可観測性）。
- `doctor` に journal integrity チェックを追加し、既存 job の journal 破損・counter 逆行を報告する。

**Non-Goals**:

- record への sequence 番号・hash chain の付与（`specrunner verify` の設計と一体で判断。append 経路に
  read-before-append を持ち込むため本 change 外）。
- 破損 journal の自動修復・recovery コマンド（append-only truth の rewrite は D3 違反。復元は git
  history に委ねる）。
- append 経路（`appendEventRecord` / D3）の変更。
- state.json（projection）破損時の挙動変更（`list()` が corrupt state.json を skip する既存挙動を含む）。
- state schema（`version`）の変更。`_journal` counters の形も変えない（変わるのはその解釈のみ）。

## Decisions

### D1: 破損検出は `fold()` に持たせ、`FoldResult.corruption` で報告する（throw しない）

`fold()` に「committed 行（非空行から末尾 partial を除いたもの）のうち最初の破損行」を表す
`FoldResult.corruption?: FoldCorruption`（`{ lineIndex; reason: "invalid-json" | "not-an-object";
snippet }`）を追加する。検出規則:

1. 非空行を集める。空なら破損なし。
2. 末尾判定: 最後の非空行を `JSON.parse` して **失敗したときのみ** partial とみなし drop する
   （crash 正常系）。成功したら committed に含める。
3. committed 各行: `JSON.parse` が失敗 → `invalid-json` 破損。成功しても plain object
   （非 null・非 array・`typeof === "object"`）でなければ `not-an-object` 破損。最初の破損の
   `lineIndex` / `reason` / `snippet`（先頭数十文字）を記録する。
4. object record は従来どおり type で dispatch。既知 type 以外の object は forward compat として無視し
   破損扱いしない。

破損があっても fold は valid 行から best-effort に steps / history を組み立てて返す（可観測性のため）。
「fail するか」は caller の policy。

**Rationale**: 要件1は「区別して呼び出し元に **報告** する」。`fold()` を throw させると
`job show` の読み取り専用表示（要件4）や doctor の enumerate が壊れる。純関数のまま報告フィールドを
足せば、consume 経路は fail-closed、観測経路は tolerant、という policy 分岐を caller 側で選べる。
既存 caller は新フィールドを無視するだけで無変更 green。

**Alternatives considered**:
- `fold()` が破損で throw する: 全 caller に try/catch を強制し、観測経路（job show / doctor / list）が
  壊れる。純度も失う。不採用。
- 破損行数を全数集計: fail-closed には「1 件でもあるか」で十分。最初の破損の位置と理由が診断に有用。
  全数走査は不要な複雑さ。最初の 1 件のみ記録する。

### D2: 「object でない」の定義は plain object 必須（array / primitive / null は破損）

committed 行が `JSON.parse` に成功しても、plain object（`{...}`）でなければ破損とする。JSONL truth の
1 行 = 1 record は常に object であり、`42` / `"x"` / `true` / `null` / `[...]` は truth の record では
ない。現行 196 行の `typeof !== "object" || null` skip と、array を unknown record として無視していた
挙動（`obj["type"]` が undefined → forward-compat 無視）を、いずれも破損検出に置き換える。

**Rationale**: 要件1「parse 結果が object でない場合」を厳密化。array は `typeof === "object"` だが
record ではないため破損に含める。forward compat が守るのは「**object** だが未知 type」のケースのみ
であり、非 object を守る必要はない。既存テストに非 object 中間行を許容するものは無い。

### D3: counter 逆行の検出は共有純関数 `detectCounterReversal(stored, fold)` に切り出す

新モジュール `src/store/journal-integrity.ts` に、逆行の型と検出を集約する:

- `CounterReversal = { field: "history" | "step"; step?: string; stored: number; actual: number }`
- `JournalIntegrityIssue = { kind: "corrupt-record"; corruption: FoldCorruption } | { kind:
  "counter-reversal"; reversal: CounterReversal }`
- `detectCounterReversal(stored: { historyCount; stepCounts }, fold: FoldResult): CounterReversal | null`
  — `fold.historyCount < stored.historyCount`、または `stored.stepCounts` の各 step で
  `(fold.stepCounts[s] ?? 0) < stored.stepCounts[s]` を満たす最初のものを逆行として返す。
- `describeJournalIssue(issue): string` — error detail / doctor 表示用の一行説明。
- `inspectJournalDir(dir): Promise<JournalIntegrityIssue | null>` — `dir/events.jsonl` を fold し、
  破損があれば corrupt-record、無ければ `dir/state.json` の `_journal` と照合して逆行を返す。ファイル
  不在は `null`（破損でない）。**throw しない**（要件4/5 の観測経路が共有する）。

**Rationale**: 逆行検出は `persist()`・`doctor`・`job show` の 3 箇所が必要とする。純関数に切り出せば
inject して unit test で駆動でき、`JournalCounters` の内部表現（job-state-store.ts）に doctor が依存
しないで済む。`inspectJournalDir` を job show と doctor で共有すると DRY。

**Rationale（逆行は「stored > actual」のみ）**: append→counters の書き込み順により正しい運用では常に
`journal ≥ counters`。`stored > actual` は外部切り詰め以外に発生しない。`actual > stored`（fold の方が
多い）は crash recovery の正常系（既存 D3）であり逆行ではない。よって「stored を下回る」だけを逆行と
判定して誤検出を避ける。

### D4: 専用 error code `JOURNAL_CORRUPTED` と factory を追加する

`ERROR_CODES.JOURNAL_CORRUPTED` と `journalCorruptedError(eventsPath, detail)` を `src/errors.ts` に足す。
中間破損・counter 逆行の両方が同一 code を使う（要件2「専用 error code」・要件3「要件2 と同じ error」）。
hint は「events.jsonl は append-only truth で hand-edit / 切り詰め不可。git history から復元して再実行」。
`EXIT_CODE_MAP` には登録せず default GENERAL_ERROR(1)（`STATE_FILE_INVALID` と同様、setup/arg エラー
ではない）。

**Rationale**: 要件は「専用 error code で fail する」ことをテストで固定する。code を分けることで、
上位（run / resume / finish / cancel）は corruption を他の失敗と区別してハンドルできる。復元手段は
scope 上 git history 一択なので hint に明示する。

### D5: consume 経路（`load()` / `persist()`）を fail-closed にし、enumerate 経路（`list()`）は tolerant に保つ

`loadSplitLayout()` を、tolerant な内部 `composeSplitLayout(...)`（`{ state; corruption:
FoldCorruption | null }` を返す。fold の破損を報告するが throw しない）と、その薄い fail-closed
ラッパ `loadSplitLayout()`（corruption があれば `journalCorruptedError` を throw、無ければ state を返す）に
分割する。

- `JobStateStore.load()` は `loadSplitLayout()`（fail-closed）を使う。→ resume / finish / cancel が
  使う `loadStateByJobId` も fail-closed になる（consume 経路。破損 truth では動かない）。
- `JobStateStore.list()` の 5 箇所は `composeSplitLayout()`（tolerant）に切り替え、corruption を無視して
  job を **surface** する。state.json 破損は従来どおり compose が throw → list の既存 try/catch が skip
  （scope-out 維持）。
- `persist()` の fold 経路: fold 後に「`foldResult.corruption` があれば `journalCorruptedError` を throw」
  「`detectCounterReversal(existingCounters, foldResult)` が非 null なら throw」を追加。逆行が無いことを
  確認できた時点で `fold ≥ stored` が保証されるため、`Math.max` / `mergeStepCountsMax` による吸収を廃止し
  recovered counters = fold 由来の値とする（`mergeStepCountsMax` は未使用になるので削除）。
- `load()` は corruption のみ fail-closed とし、counter 逆行は **fail させない**（要件は逆行 fail を
  `persist()` に限定。load は元々吸収せず小さい fold をそのまま使う挙動で、逆行は直後の persist / doctor で
  捕捉される）。fast path（fold を省く経路）は変更しない（新規 event が無いときの cursor 書き換えのみで、
  破損を導入しないため）。

**Rationale**: fail-closed は「truth を消費して判断・書き込みを行う」単一 job 経路（load/persist）に
必要。enumerate（`list()` → `ps` / slug 解決 / job show slug）は読み取り専用の可観測性であり、破損 job を
**落とすと逆に観測不能になる**。現行 `list()` は破損 journal の job を（silent degrade しつつ）surface して
いるため、tolerant を保つことが既存 `ps` 挙動の保存でもある。要件3 が逆行 fail を persist に明示している
のに合わせ、load への逆行 fail 追加は行わない（要件を超える安全制約を足さない）。

**Alternatives considered**:
- `loadSplitLayout` をそのまま fail-closed にして `list()` にも波及させる: 破損 journal の job が `ps` から
  消え、job show slug が対象を見つけられず要件4 を満たせない。かつ既存 `ps` 挙動を暗黙変更する。不採用。
- 逆行も load で fail-closed: 要件が明示していない安全制約の追加（要件肥大）。persist / doctor で捕捉
  されるため不要。不採用。

### D6: `job show` は probe で corruption を明示し、header は projection から出す

`printJobState()` に、changeDir 解決後の journal probe を足す:

- `inspectJournalDir(changeDir)` を呼び、issue が返れば「⚠ Journal integrity: CORRUPTED — <describe>」の
  banner（+ git 復元 hint）を表示し、lineage / cost セクションを **抑止** する（fold が信頼できないため）。
  header（Job ID / Status / Branch / Step / Created / Updated）は state.json 由来なので従来どおり表示する。
- issue が null なら従来どおり lineage / cost を表示する。
- UUID 入力で `loadStateByJobId` が `JOURNAL_CORRUPTED` を throw した場合は、`runJobShow` の既存 catch に
  「`SpecRunnerError && code === JOURNAL_CORRUPTED` なら corruption banner を表示して crash させない」分岐を
  足す。slug 入力は tolerant な `list()`（D5）から header state を得られるため、`printJobState` の probe が
  そのまま corruption を表示する。

exit code は corruption 表示でも 0（観測は成功）。機械的な fail は doctor（D7）が担う。

**Rationale**: 要件4「crash せず corruption を明示、読み取り専用の可観測性を保つ」。header の source は
projection（state.json）で journal と独立なので、journal が壊れても header は出せる。probe は
`inspectJournalDir` を共有し、ファイル不在時 null を返すため、changeDir が解決できない既存テスト
（`/fake/repo`）や journal に破損の無いテストは無変更 green。UUID の fail-closed load は shared なので
（resume 等の fail-closed を壊さないため）catch 分岐で観測に落とす。

**Alternatives considered**:
- `job show` UUID 経路を tolerant loader に置換: `loadStateByJobId` を mock する既存 job-show テストを
  壊す。fail-closed loader は resume/finish が必要とするため shared のまま catch で観測に落とす。不採用。
- corruption 時 exit 1: 要件は exit code を規定せず「crash しない・明示する」。観測は成功しているので 0 と
  し、機械 gate は doctor に集約する。不採用（ただし将来 verify で再検討可）。

### D7: doctor に storage カテゴリの `journal-integrity` check を factory パターンで追加する

`src/core/doctor/checks/storage/journal-integrity.ts` に `createJournalIntegrityCheck(overrideScan?)` と
default `journalIntegrityCheck` を追加し、`checks/index.ts` の `commonChecks`（storage セクション）に登録
する。default scan `scanJournalIntegrity({ repoRoot })` は active（`specrunner/changes/<slug>`、
archive / canceled dir 名は除外）・worktree（`.git/specrunner-worktrees/*/specrunner/changes/<slug>`）・
archive（`specrunner/changes/archive/*`）の各 job dir を列挙し、各 dir で `inspectJournalDir` を呼んで
`{ location; slug; issue }` を集める。

- issue 0 件 / job 無し → `pass`。
- issue あり → `fail`（status "fail" は required に関わらず exit 1）。message は件数、details は各
  location + `describeJournalIssue`、hint は git 復元。
- scan 中の I/O エラー（readdir 失敗等）は `pass`（他 storage check と同じ防御。integrity 失敗は
  「実際に fold して破損を検出した」ケースに限定してシグナルを保つ）。`required: false`。

**Rationale**: 要件5。enumerate は fail-closed にできない（D5）ため、doctor が「既存 job の journal を
再 fold して中間破損・counter 逆行を報告する」機械 gate を担う。orphan-worktrees と同じ factory + 注入
scan にすることで、実 FS を使わず unit test で駆動でき、既存 doctor の構成規約に沿う。archive を含めるのは
attestation（archived journal の再 fold 可能性）に資するため。

## Risks / Trade-offs

- [Risk] `fold()` の破損定義変更で、既存の「中間 silent-skip を前提にした」テストが赤化する。
  → Mitigation: 現行テストを調査した結果、中間 silent-skip を固定するテストは存在しない
  （`event-journal.test.ts` は末尾 partial のみ、`artifact-observability.test.ts` は object の未知/legacy
  type のみを固定）。実装時に grep で再確認し、該当があれば新契約に更新、無ければ既存は無変更 green。

- [Risk] `persist()` の max() 吸収廃止が、stored > journal を正常系とする既存テストを赤化する。
  → Mitigation: 既存 persist テストは `_journal` を `{0,{}}` または journal と一致で与えており、
  stored > journal を成功前提にするものは無い（crash recovery テスト TC-003/030 は fold > stored の逆向き）。
  実装時に全 store テストで確認する。

- [Trade-off] `load()` は counter 逆行を fail させない（corruption のみ）。切り詰め journal は load では
  小さい state をそのまま返す。
  → 直後の `persist()` と `doctor` が逆行を捕捉する。要件3 の明示スコープ（persist）に一致し、要件を超える
  load 側の安全制約を足さない方針。

- [Risk] `list()` を tolerant に切り替える際、破損 journal の job が `ps` に degrade したまま出る。
  → 現行も silent degrade で出ている（挙動保存）。破損の機械通知は doctor が担い、job show が明示する。

- [Risk] doctor scan が大量 job / 大きい journal で遅くなる。
  → active + worktree + archive の一巡のみ。`inspectJournalDir` は 1 job につき events.jsonl 1 read + fold。
  他の storage scan と同オーダー。scan エラーは pass に落として exit code を汚さない。

- [Trade-off] job show corruption 時に lineage / cost を抑止する。
  → fold が信頼できない以上、部分的な lineage を出すより「corruption である」ことを明示する方が正直。

## Open Questions

- なし（fold の報告方式・fail-closed の適用範囲・逆行の定義・enumerate の tolerant 維持・doctor の
  scan 範囲・job show の exit code は architect 評価済みの方針と本 design D1–D7 で確定）。
