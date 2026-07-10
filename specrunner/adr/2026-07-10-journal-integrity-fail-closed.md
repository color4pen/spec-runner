# Event Journal の中間破損を Fail-Closed にする — fold の corruption 検出と counter 逆行検査

## Status

Accepted (2026-07-10)

## Context

`events.jsonl`（event journal）は `architecture/domain-model.md` が定める **append-only の truth** であり、
`state.json`（projection）はその fold で再構成できる cache にすぎない。

しかし実装は truth の欠損を検出できなかった:

1. `fold()`（`src/store/event-journal.ts`）は末尾 partial 行の drop（crash 正常系）とは別に、
   ループ内で中間行の `JSON.parse` 失敗を `continue` で **silent skip** していた。
   step attempt や transition が欠けた fold 結果がそのまま resume・routing・projection 再構成に使われる。
2. `persist()`（`src/store/job-state-store.ts`）の delta 計算は、fold 結果が `state.json` 側
   `_journal` counters を下回っても `Math.max` / `mergeStepCountsMax` で **吸収**していた。
   journal が外部要因で切り詰められていても検出されない。

「journal = 再計算可能な事実」はロードマップの attestation 線（journal 再 fold による verdict
再導出・第三者監査）の前提であり、欠損が黙殺される現状ではその前提が立たない。

本 ADR は truth の欠損を **検出して fail-closed にする** 設計判断を記録する。
sequence 番号・hash chain の付与（`specrunner verify` の設計と一体で判断が必要）は本変更外とする。

## Decision

### D1: 破損検出は `fold()` に持たせ、`FoldResult.corruption` で報告する（throw しない）

`fold()` に `FoldResult.corruption?: FoldCorruption`（`{ lineIndex; reason: "invalid-json" | "not-an-object"; snippet }`）
を追加し、最初の破損行を呼び出し元に **報告** する。

検出規則:

1. 非空行を集める。空なら破損なし。
2. 最後の非空行の `JSON.parse` が **失敗したときのみ** partial とみなし drop する（crash 正常系）。
3. 残りの committed 各行: `JSON.parse` 失敗 → `invalid-json` 破損。parse 成功でも plain object
   （非 null・非 array・`typeof === "object"`）でなければ `not-an-object` 破損。
4. object record は従来どおり type で dispatch。**既知 type 以外の object は forward compat として無視し破損扱いしない**。

破損があっても fold は valid 行から best-effort に steps / history を組み立てて返す（可観測性のため）。
「fail するか」は caller の policy とする。

**Rationale**: `fold()` を throw させると `job show` の読み取り専用表示や doctor の enumerate が壊れる。
純関数のまま報告フィールドを足せば、consume 経路は fail-closed、観測経路は tolerant という
policy 分岐を caller 側で選べる。既存 caller は新フィールドを無視するだけで無変更 green になる。

### D2: "object でない" の定義は plain object 必須（array / primitive / null は破損）

committed 行が `JSON.parse` に成功しても、plain object（`{...}`）でなければ破損とする。
JSONL truth の 1 行 = 1 record は常に object であり、`42` / `"x"` / `true` / `null` / `[...]` は
truth の record ではない。array は `typeof === "object"` だが record ではないため破損に含める。

**forward compat が守るのは「object だが未知 type」のケースのみ**であり、非 object を守る必要はない。

### D3: counter 逆行の検出は共有純関数 `detectCounterReversal()` に切り出す

新モジュール `src/store/journal-integrity.ts` に以下を集約する:

- `CounterReversal = { field: "history" | "step"; step?: string; stored: number; actual: number }`
- `JournalIntegrityIssue = { kind: "corrupt-record"; ... } | { kind: "counter-reversal"; ... }`
- `detectCounterReversal(stored, fold): CounterReversal | null` — `fold.historyCount < stored.historyCount`、
  または stored の各 step count が fold を上回る最初のものを逆行として返す
- `describeJournalIssue(issue): string` — error detail / doctor 表示用の一行説明
- `inspectJournalDir(dir): Promise<JournalIntegrityIssue | null>` — `dir/events.jsonl` を fold し、
  破損があれば corrupt-record、無ければ `dir/state.json` の `_journal` と照合して逆行を返す。
  **throw しない**（要件4/5 の観測経路が共有する）

**逆行の定義は「stored > actual」のみ**: append→counters の書き込み順により正しい運用では
常に `journal ≥ counters`。`stored > actual` は外部切り詰め以外に発生しない。
`actual > stored`（fold の方が多い）は crash recovery の正常系であり逆行ではない。

### D4: 専用 error code `JOURNAL_CORRUPTED` と factory を追加する

`ERROR_CODES.JOURNAL_CORRUPTED` と `journalCorruptedError(eventsPath, detail)` を `src/errors.ts` に追加する。
中間破損・counter 逆行の両方が同一 code を使う。hint は
「events.jsonl は append-only truth で hand-edit / 切り詰め不可。git history から復元して再実行」。

`EXIT_CODE_MAP` には登録せず default GENERAL_ERROR(1)（`STATE_FILE_INVALID` と同様）。

### D5: consume 経路（`load()` / `persist()`）を fail-closed に、enumerate 経路（`list()`）は tolerant に保つ

`loadSplitLayout()` を以下に分割する:

- `composeSplitLayout(...)` — tolerant。`{ state; corruption: FoldCorruption | null }` を返す。throw しない
- `loadSplitLayout()` — fail-closed wrapper。corruption があれば `journalCorruptedError` を throw

適用方針:

- `JobStateStore.load()` → `loadSplitLayout()`（fail-closed）→ resume / finish / cancel が使う
  `loadStateByJobId` も fail-closed になる（破損 truth では動かない）
- `JobStateStore.list()` の 5 call site → `composeSplitLayout()`（tolerant）。破損 job を **surface し続ける**。
  `ps` の観測可能性を維持する
- `persist()` の fold 経路: 「corruption → counter 逆行」の順でチェック後、
  `Math.max` / `mergeStepCountsMax` による吸収を廃止し、fold 由来の値を recovered counters とする

`load()` は counter 逆行を fail させない（corruption のみ fail-closed）。
切り詰め journal は load では小さい state をそのまま返し、直後の `persist()` / `doctor` が逆行を捕捉する。

**Rationale**: fail-closed は「truth を消費して判断・書き込みを行う」単一 job 経路に必要。
enumerate（`list()` → `ps` / slug 解決 / job show slug）は読み取り専用の可観測性であり、
破損 job を落とすと逆に観測不能になる。現行 `list()` は破損 journal の job を silent degrade で
surface しており、tolerant を保つことが既存挙動の保存でもある。

### D6: `job show` は probe で corruption を明示し、header は projection から出す

`printJobState()` に changeDir 解決後の `inspectJournalDir()` probe を追加:

- issue あり → 「⚠ Journal integrity: CORRUPTED — <describe>」の banner + git 復元 hint を表示。
  lineage / cost セクションを **抑止**（fold が信頼できないため）。
  header（Job ID / Status / Branch / Step / Created / Updated）は `state.json` 由来なので従来どおり表示
- issue なし → 従来どおり lineage / cost を表示
- UUID 入力で `loadStateByJobId` が `JOURNAL_CORRUPTED` を throw した場合は `runJobShow` の catch で
  banner 表示 + **exit 0**（観測は成功）

機械的な fail は doctor（D7）が担い、`job show` は exit code を汚さない。

### D7: doctor に storage カテゴリの `journal-integrity` check を factory パターンで追加する

`src/core/doctor/checks/storage/journal-integrity.ts` に
`createJournalIntegrityCheck(overrideScan?)` と default `journalIntegrityCheck` を追加し、
`checks/index.ts` の `commonChecks`（storage セクション）に登録する。

default scan `scanJournalIntegrity({ repoRoot })` は
active（`specrunner/changes/<slug>`）・worktree（`.git/specrunner-worktrees/*/specrunner/changes/<slug>`）・
archive（`specrunner/changes/archive/*`）の各 job dir を列挙し、各 dir で `inspectJournalDir` を呼ぶ。

- issue 0 件 / job 無し → `pass`
- issue あり → `fail`（exit 1）。message は件数、details は各 location + `describeJournalIssue`、hint は git 復元
- scan 中の I/O エラーは `pass`（他 storage check と同じ防御。integrity 失敗は「実際に fold して破損を検出した」ケースに限定）
- `required: false`

## Alternatives Considered

### Alternative 1: `fold()` が破損で throw する（D1 の代替）

- **Pros**: caller が破損を無視できなくなる（型強制）
- **Cons**: 全 caller に try/catch を強制し、観測経路（job show / doctor / list）が壊れる。純度も失う
- **Why not**: 観測経路と consume 経路で policy を分けられない。「throw しない純関数 + caller policy」が最小変更で両立できる

### Alternative 2: max() 吸収の維持 + warning のみ（D5 の代替）

- **Pros**: 既存挙動との互換性が高い。誤検出ゼロ
- **Cons**: truth の欠損を warning で流すと「journal = 再計算可能な事実」という attestation の前提が立たない
- **Why not**: ロードマップの attestation 線（verdict 再導出・第三者監査）の前提を壊す

### Alternative 3: 破損行の自動除去・journal rewrite（D1 の代替）

- **Pros**: 破損 job を即座に回復できる
- **Cons**: append-only truth の rewrite は D3 違反。監査対象を修復ツール自身が改変することになる。
  git history からの復元という唯一の回復経路を正しく使えなくなる
- **Why not**: 設計 D3 の根幹に反する

### Alternative 4: `loadSplitLayout` をそのまま fail-closed にして `list()` にも波及させる（D5 の代替）

- **Pros**: 実装が単純（1 関数）
- **Cons**: 破損 journal の job が `ps` から消え、job show slug が対象を見つけられず要件を満たせない。
  既存 `ps` 挙動を暗黙変更する
- **Why not**: observability の喪失は fail-closed よりも危険。enumerate は tolerant を維持する

### Alternative 5: sequence 番号・hash chain の付与（D1 の代替）

- **Pros**: 整合チェックがより厳密になる
- **Cons**: append 経路（`fs.appendFile` のみ・no reads）へ read-before-append を持ち込む。
  `specrunner verify` の設計と一体で判断が必要
- **Why not**: append 経路を変えずに入れられる検出強化（fold + counter 検査）が最小形。
  sequence / hash chain は verify コマンドの設計と一体で判断する

### Alternative 6: counter 逆行も `load()` で fail-closed にする（D5 の代替）

- **Pros**: 切り詰め journal で load が小さい state を返す期間をなくし、逆行を load 時点で即座に止められる
- **Cons**: 要件が明示していない安全制約の追加（要件肥大）。直後の `persist()` / `doctor` で捕捉される
- **Why not**: 要件を超える load 側の安全制約は足さない方針

### Alternative 7: `job show` UUID 経路を tolerant loader に置換する（D6 の代替）

- **Pros**: UUID 経路で `JOURNAL_CORRUPTED` 例外をそもそも発生させず、catch 分岐が不要になる
- **Cons**: `loadStateByJobId` を mock する既存 job-show テストが壊れる。fail-closed loader は resume / finish / cancel が共用するため、tolerant に置換すると consume 経路の保証が崩れる
- **Why not**: fail-closed loader は consume 経路の安全性のために shared のまま保つ必要があり、job show 側で catch して観測に落とす方が影響を局所化できる

### Alternative 8: `job show` corruption 時に exit 1 とする（D6 の代替）

- **Pros**: 破損を機械的に検出可能にし、CI スクリプトから exit code で分岐できる
- **Cons**: 要件は「crash しない・明示する」のみで exit code を規定しない。観測は成功しているため exit 1 は誤った失敗信号になる。機械 gate は doctor に集約する設計と重複する
- **Why not**: 観測は成功しているので 0 とし、機械 gate は doctor が担う。将来 `specrunner verify` での再検討余地あり

## Consequences

### Positive

- truth の欠損（中間破損・counter 逆行）が detect されず resume / routing に流れる問題が解消される
- consume 経路（fail-closed）と観測経路（tolerant）の policy が型・モジュールで明示される
- `inspectJournalDir` が job show / doctor の共有 pure function となり DRY かつ unit test で駆動できる
- `doctor journal-integrity` が既存 job の integrity を機械チェックする gate となる
- forward compat（未知 type の object を破損扱いしない）が spec + test で固定される

### Negative / Trade-offs

- `fold()` の contract 変更（silent-skip → corruption 報告）により、中間 silent-skip を固定していた
  既存テストがあれば更新が必要（調査済み: 該当テストは存在しなかった）
- `list()` は破損 journal の job を silent degrade したまま surface し続ける（観測可能性のトレードオフ）。
  doctor が機械 gate を担う
- `load()` は counter 逆行を fail させない。切り詰め journal で load が小さい state を返す期間が生じるが、
  直後の persist / doctor が捕捉する
- job show corruption 時に lineage / cost を抑止する。
  fold が信頼できない以上、部分的な lineage を出すより corruption であることを明示する方が正直

### Known Gaps / Future Work

- `events.jsonl` record への sequence 番号・hash chain の付与は `specrunner verify` の設計と一体で判断する（本変更外）
- 破損 journal の自動修復・recovery コマンドは append-only truth の D3 違反のため提供しない。
  復元は git history に委ねる
- `scanJournalIntegrity` の active / archive セクションで非 ENOENT の readdir エラーが再 throw される
  非対称が残る（doctor check の外側 try/catch が pass に落とすため最終挙動は D7 通り。
  public API 化時に never-throw に統一する）

## References

- Request: `specrunner/changes/journal-integrity-fail-closed/request.md`
- Design: `specrunner/changes/journal-integrity-fail-closed/design.md`
- Spec: `specrunner/changes/journal-integrity-fail-closed/spec.md`
- Review: `specrunner/changes/journal-integrity-fail-closed/review-feedback-001.md` (approved, 9.65/10)
- Review: `specrunner/changes/journal-integrity-fail-closed/review-feedback-002.md` (approved, 9.65/10)
- Related: `specrunner/adr/2026-06-06-event-journal-slug-dir-state-model.md` — event journal の D2（fold アルゴリズム）・D3（append-only, no rewrites）の起源
- Related: `architecture/domain-model.md` — "append-only truth" の定義
