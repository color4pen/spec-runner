# event journal の中間破損を fail-closed にする — fold の corruption 検出と counter 逆行検査

## Meta

- **type**: spec-change
- **slug**: journal-integrity-fail-closed
- **base-branch**: main
- **adr**: true

## 背景

`events.jsonl` は architecture/domain-model.md が定める「append-only truth」であり、projection（state.json）は fold で再構成できる cache にすぎない。しかし現行実装は truth の欠損を検出できない:

1. fold() は末尾の partial write（crash 正常系）だけでなく、**中間行の破損も黙って skip** する。step attempt や transition が欠けた fold 結果がそのまま resume・routing・projection 再構成に使われる
2. persist() の delta 計算は、fold 結果が state.json 側 counters を下回っても Math.max / mergeStepCountsMax で吸収する。journal が外部要因で切り詰められていても検出されない

「journal = 再計算可能な事実」はロードマップの attestation 線（journal 再 fold による verdict 再導出・第三者監査）の前提であり、欠損が黙殺される現状ではその前提が立たない。本 request は truth の欠損を**検出して fail-closed にする**ことに限定する（sequence / hash chain の付与は後続の verify 設計と一体で判断するためスコープ外）。

## 現状コードの前提

- `src/store/event-journal.ts:148-259` — fold() は末尾 partial の drop（162-179）とは別に、ループ内で中間行の JSON.parse 失敗を `continue` で skip する（189-193、コメント「Skip malformed line (not just tail)」）。JSON として parse できるが object でない行も skip（196）。既知 type 以外の object record は forward compat として無視（213）
- `src/store/event-journal.ts:273-280` — appendEventRecord は fs.appendFile のみ（設計 D3: no reads, no rewrites）
- `src/store/job-state-store.ts:441-529` — persist() は state.json の `_journal` counters（historyCount / stepCounts）で delta 検出。journal 再読込時、fold 結果と stored counters の不一致は `Math.max(existingCounters.historyCount, foldResult.historyCount)`（502）と `mergeStepCountsMax`（503）で吸収される。counters が in-memory 件数以上のときの fast path（476-482）では journal を読み直さない
- `src/cli/job-show.ts:170` — job show も fold() を直接呼び、破損の有無を区別せず表示する
- `src/core/doctor/checks/` — agents / auth / config / env / repo / runtime / storage のチェックカテゴリが存在し、journal integrity のチェックは存在しない
- `src/errors.ts:37-104` — SpecRunnerError + ERROR_CODES + factory 関数（例: `stateFileInvalidError`:179）が error 表現の慣例

## 要件

1. fold() が「許容される末尾 partial」と「中間破損」を区別して呼び出し元に報告する。中間破損 = 末尾以外の非空行が JSON.parse に失敗する、または parse 結果が object でない場合。既知 type 以外の object record は従来どおり forward compat として無視し、破損扱いしない
2. JobStateStore の load() / persist() は中間破損を検出したら黙って続行せず、専用 error code を持つ SpecRunnerError で fail する（fail-closed）。末尾 partial の drop は従来どおり許容する
3. persist() が journal を再読込した際、fold 結果の historyCount / stepCounts が stored counters を**下回る**場合を journal 切り詰めとして要件 2 と同じ fail-closed エラーで扱う（現行の max() 吸収を廃止する）
4. job show は破損 journal に対して crash せず、corruption であることを明示して表示する（読み取り専用の可観測性を保つ。表示の詳細度は design 判断）
5. doctor に journal integrity チェックを追加する（既存 job の events.jsonl を fold して中間破損・counter 逆行を報告する）
6. 誤検出の防止: journal が存在しない / 空 / 末尾 partial のみ、の各ケースは破損ではない

## スコープ外

- record への sequence 番号・hash chain の付与（`specrunner verify` の設計と一体で判断する）
- 破損 journal の自動修復・recovery コマンド（append-only truth の rewrite は設計 D3 違反。復元は git history に委ねる）
- append 経路（appendEventRecord / D3）の変更
- state.json（projection）破損時の挙動変更（`list()` が corrupt state.json を skip する既存挙動を含む）
- state schema（version）の変更

## 受け入れ基準

- [ ] 中間破損行（非 JSON 行 / 非 object 行）を含む journal で load / persist が専用 error code で fail することをテストで固定する
- [ ] 末尾 partial のみの journal が従来どおり許容される（fold が成功し、partial が drop される）ことをテストで固定する
- [ ] fold 結果が stored counters を下回る journal（切り詰め）で persist が fail することをテストで固定する
- [ ] 既知 type 以外の object record が破損扱いされない（forward compat 維持）ことをテストで固定する
- [ ] journal なし / 空 journal が破損扱いされないことをテストで固定する
- [ ] doctor が破損 journal を報告することをテストで固定する
- [ ] job show が破損 journal で crash せず corruption を明示することをテストで固定する
- [ ] 中間破損の silent-skip を固定している既存テストがある場合のみ新契約に合わせて更新し、それ以外の既存テストは無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: 検出 + fail-closed のみに限定する。sequence / hash chain は付与時に append 経路（fs.appendFile のみ・no reads）へ read-before-append を持ち込むため、verify コマンドの設計と一体で判断すべき。append 経路を変えずに入れられる検出強化が最小形
- **採用**: 末尾 partial の許容は維持する。append 中の kill による partial write は crash 正常系であり、fail-closed にすると resume 可用性を壊す
- **却下**: max() 吸収の維持 + warning のみ — truth の欠損を warning で流すと「journal = 再計算可能な事実」という attestation の前提が立たない
- **却下**: 破損行の自動除去・journal rewrite — append-only truth の rewrite は D3 違反であり、監査対象を修復ツール自身が改変することになる
