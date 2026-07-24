# ADR-20260724: spec-review に全量列挙規律を課し、finding の後出しを観測信号として機械検出する

**Date**: 2026-07-24
**Status**: accepted

## Context

spec-review が同一 revision に対して見えているはずの finding を round ごとに 1 件ずつ
小出しにし、有限のループ予算（1 起動あたり review 2 回）を食い潰して exhaustion 停止を
繰り返す事例が実運用で確認された。実測では 6 finding が 5 round に分散し、
operator resume を 2 回要した。journal と git 履歴の突合により、全 finding の対象記述は
初回 round の revision に既に存在していたこと（fixer 編集による「動く標的」ではないこと）、
および同一 round で同型の欠落の片方だけを報告し次 round でもう片方を報告するパターンが
確認された。

原因は reviewer の完了契約に網羅性の要求が無いこと: finding 1 件でも有効な needs-fix
結果として成立するため、agent が満足化する。

semantic な網羅性そのものは機械検証できないが、検証可能な近似として「後出し検出」が
成立する。round N+1 の finding の対象記述が round N がレビューした revision に既に存在
していた場合、それは round N の見逃しであり機械判定できる。

関連する実装事実:

- `src/prompts/spec-review-system.ts` — `## Method` 節はレビュー観点の列挙のみで、
  finding を全量列挙する規律が存在しない。
- `src/core/step/commit-orchestrator.ts` — `applySuccessPostPersistEffects` は
  verdict 確定・永続化の後に走る best-effort ブロックであり、lineage 記録が既にここに置かれている。
- `src/state/helpers.ts` — `StepRun` は run ごとの `commitOid`（exit commit）を記録し、
  spec-review は canon を書かない judge step のため run N の commitOid が
  run N がレビューした revision に対応する。
- `src/core/port/runtime-strategy.ts` — git を読む seam は RuntimeStrategy port に集約されており、
  任意 OID での file 読み出しを追加するための拡張点が存在する。

## Decision

### D1: prompt 規律と後出し検出の二層構成を採用する

spec-review の system prompt `## Method` 節に全量列挙規律を追記して行動を変えつつ、
後出し検出で遵守を測る二層構成を採用する。

- **採用理由**: prompt 規律のみでは遵守が測定不能になり、規律が効いているかを次の実運用で
  判定できない。「agent 自己申告は信頼できない」原則に反する。後出し検出のみでは行動を
  変える梃子が無く、規律文が無いと agent は満足化を続ける。両層が相補的であり、
  prompt 規律が agent の行動を変え、後出し検出がその遵守を観測する。

**却下案**:

- *prompt 規律のみ（検出なし）*: 却下。遵守が測定不能。規律を追加しても効果を確認する
  手段が無く、次の実運用での判定が「感触」に依存する。
- *後出し検出のみ（prompt 変更なし）*: 却下。行動変容の梃子が無い。agent は依然として
  満足化するため検出が毎 round 発火し続けるだけで収束しない。

### D2: 後出し検出を観測信号に留め verdict を変更しない

後出し検出は journal 記録と stderr 要約に留め、verdict / escalationReason /
finding-ref 実在検証を一切変更しない。

- **採用理由**: 後出しを即 gate 化すると、判定の偽陽性（内容一致の限界）が新たな不当停止を
  生む。行番号を使わず全行 trim 走査をする内容一致は、前 revision に偶然同一行が存在する
  場合に `late` と誤判定する。信号を蓄積し、誤判定率の実測値を見てから gate 化を別 request
  で判断する。

**却下案**:

- *後出し `late` finding を即 escalation gate にする*: 却下。内容一致の偽陽性が不当停止を
  引き起こす。観測信号の精度を実運用で確認する前に gate 化するのはリスクが高い。
- *severity 閾値の復活（low / medium は記録のみで前進）*: 却下。実測で clone() 欠落等の
  実装を壊しうる仕様穴が low / medium で報告されており、素通りに戻すと ADR-20260723
  (spec-review-fixer-routing) が解決した問題が再発する。
- *maxIterations の引き上げ*: 却下。小出しの根因を放置して予算で吸収する対症療法であり、
  round 数（= コストと時間）が線形に増えるだけで収束性は改善しない。

### D3: 後出し検出を post-persist の best-effort 後処理として配置する

後出し検出の計算・journal 記録・stderr 要約を `commit-orchestrator` の
`applySuccessPostPersistEffects`（verdict 確定・永続化の後に走る best-effort ブロック、
lineage と同じ層）に配置し、`step-completion.ts`（verdict 導出）は一切変更しない。

- **採用理由**: D2（verdict 不変）を構造で保証する。verdict は後出し検出が走る前に既に
  導出・永続化されており、後出し検出は verdict / state への書き戻し経路を持たない。
  `step-completion.ts` を編集しないことで、finding-ref 実在検証・escalationReason 計算・
  verdict 導出の無変更を差分ゼロで担保する。lineage が既に「digest I/O + journal append」を
  この位置で best-effort に行う前例があり、対称的に収まる。

**却下案**:

- *`deriveStepCompletion` 内で計算し `StepCompletion` に結果を積んで orchestrator が append する*:
  却下。verdict 導出関数に後処理を差し込むことになり、verdict 不変の証明が
  「差し込んだブロックが verdict 変数に触れていないこと」のレビューに依存する。
  post-persist 配置ならファイル自体を触らず構造で保証できる。

### D4: 後出し判定を純関数・薄い配線・runtime seam の 3 層に分解する

後出し検出を以下の 3 層に分ける:

1. 純関数 `classifyFindingRecency(targetLineContent, priorFileContent): FindingRecency`
   — 副作用なし。`src/core/step/finding-recency.ts`。行番号を使わず全行 trim 走査で
   内容一致を判定し、判定不能は `indeterminate` に倒す。
2. 配線 `computeFindingRecency` / `recordFindingRecency` — seam を呼んで per-finding 結果を
   組み立て、journal 記録と stderr 要約を行う。同ファイル。
3. runtime seam `readRevisionContent` — RuntimeStrategy port に追加。local は worktree 読みと
   `git show <priorOid>:<file>` で実装し、managed は prior 解決不能のため常に null を返し
   `indeterminate` に倒す（偽信号を出さない）。

配線は `step.name === SPEC_REVIEW` の gate で spec-review のみに限定する。
判定関数は汎用に作り（どの judge でも再利用可能）、配線のみ spec-review に限定する。

- **採用理由**: 純関数は完全に単体テスト可能で 3 値の固定を最小の依存で行える。
  I/O（git 読み）は seam に隔離し、domain 層は port 経由でのみ git に触れる（既存の DSM 規律に一致）。
  managed では `indeterminate` に倒れることで偽信号を出さず、verdict 不変も構造的に保証される。

### D5: 後出し記録を journal-only の EventRecord（`finding-recency` 型）にする

`FindingRecencyRecord`（`type: "finding-recency"`）を EventRecord tagged union に追加し、
`store.appendFindingRecency`（JobJournal + JobStateStore）で `events.jsonl` に append する。
lineage / operator-event と同じ journal-only 記録であり、`state.json` / NormalizedJobState
には materialize しない。

記録内容: `{ type, step, ts, iteration, priorOid: string | null, findings: { file, line?, title, severity, recency }[] }`。

`fold()` は `finding-recency` 行を dispatch し `FoldResult.findingRecency?: FindingRecencyRecord[]`
に収集する。`FoldResult.findingRecency` は optional field とし、既存の FoldResult リテラル構築を
無改変で通す。unknown type は前方互換のため既存どおり無視されるので、旧 code が新 journal を
読んでも安全。

- **採用理由**: journal-only 記録の前例（lineage / operator-event）に一致し、operator が
  run 後に `events.jsonl` から後出し信号を確認でき、テストは fold 経由で projection を読める。
  state.json に materialize しないため、旧バージョンとの後方互換性が保たれる。

## Alternatives Considered

### A1: 後出し `late` finding を即 escalation gate にする

`late` 判定が 1 件以上の round は verdict を強制的に `escalation` にする案。

- **Pros**: 小出し行動を即座に停止させ、operator に明示的に通知できる。
- **Cons**: 内容一致の偽陽性（前 revision に偶然同一行が存在）が不当停止を引き起こす。
  行番号を使わない全行 trim 走査は、コメントや短い定形句で誤検出しうる。
  gate 精度の実測値が無い段階での導入はリスクが高い。
- **Why not**: 観測信号として蓄積し、偽陽性率の実測値を確認してから別 request で判断する。

### A2: `step-completion.ts` 内で後出し検出を実行する

`deriveStepCompletion` の計算中に後出し判定を実行し、結果を `StepCompletion` に積んで
orchestrator が journal append する案。

- **Pros**: 実行タイミングが `step-completion` の責務と近い。
- **Cons**: verdict 導出関数に後処理を差し込むことになり、verdict 不変の証明がレビュー依存になる。
  `step-completion.ts` の変更量が増え、finding-ref 実在検証・escalationReason 計算との
  絡み合いリスクが生まれる。
- **Why not**: post-persist 配置により `step-completion.ts` を無変更のまま verdict 不変を
  構造的に保証できる。

### A3: code-review / conformance 等の他 judge step にも同時に配線する

後出し判定関数は汎用に作るため、全 judge step に一括配線する案。

- **Pros**: 全 judge step で同様の観測が得られる。
- **Cons**: 各 judge step の特性（iteration 頻度、finding の性質）が異なり、後出し信号の
  解釈が step 毎に変わる。spec-review の実運用での効果を確認してから順次拡張するほうが
  リスクを制御できる。
- **Why not**: spec-review の小出しが具体的な問題として確認された。他 step への配線は
  信号の蓄積を見てから別 request で判断する（関数は汎用に作り配線のみを spec-review に限定する）。

### A4: severity 閾値の復活（low / medium を記録のみにして前進させる）

spec-review の verdict 規則を元の severity 閾値ベースに戻し、low / medium finding は
記録するが `needs-fix` にせず `approved` に進める案。exhaustion 停止が줄어なれば
小出し問題も緩和されるという想定。

- **Pros**: low / medium finding で spec-fixer loop が発火しなくなるため、ループ回数が
  一見抑制される。実装が単純で変更範囲が小さい。
- **Cons**: 実測で clone() 欠落等の実装を壊しうる仕様穴が low / medium severity で
  報告されており、素通りに戻すと `test-case-gen` 以降に既知の仕様欠落が流れる。
  ADR-20260723（spec-review-fixer-routing）が解決した問題が再発する。
  さらに、severity 閾値の問題と小出し問題は独立しており、閾値を戻しても
  agent の満足化（finding 1 件で needs-fix が成立する）は解消されない。
- **Why not**: 小出しの根因（完了契約に網羅性の要求が無いこと）を放置したまま
  severity 規則を緩める対症療法であり、別の既知問題（仕様欠落の下流流出）を再発させる。

### A5: maxIterations の引き上げ

ループ予算（1 起動あたり review 2 回）を増やして exhaustion 停止を抑制する案。
agent が小出しをしても review 回数が足りるようにバッファを積む。

- **Pros**: 実装コストが最小（設定値の変更のみ）。ループが収束しきれない既存ケースも含め
  一括で吸収できる。
- **Cons**: 小出しの根因（完了契約に網羅性の要求が無いこと）を放置したまま
  コストと時間（round 数）を線形に増やす対症療法。引き上げ幅が finding 数に依存するため、
  finding が多いケースでは引き上げ後も exhaustion 停止が再発しうる。
  根本解決ではないため maxIterations が恒久的な設計上の負債として残る。
- **Why not**: 小出し行動自体を変えず予算で吸収しようとする案であり、収束性は改善しない。
  コストが finding 数と iteration 数に線形比例して増え続けるため持続可能でない。

## Consequences

### Positive

- spec-review の system prompt に全量列挙規律が明示されることで、agent の行動変容の梃子が生まれる。
- 後出し検出が `finding-recency` 記録として journal に蓄積され、operator が
  規律の遵守状況を観測できるようになる。
- 後出しがある round では stderr に要約 1 行が出力され、operator が run 後に即座に気づける。
- 後出し検出は `applySuccessPostPersistEffects` の post-persist 配置により、
  verdict / escalationReason / finding-ref 実在検証への影響ゼロが構造的に保証される。
- 判定関数は汎用に作られており、将来の他 judge step への拡張（別 request）への道が開かれている。

### Negative

- 内容一致の偽陽性（前 revision に偶然同一行が存在）により `late` と誤判定する可能性がある。
  観測信号のみで verdict を変えないため不当停止は生じないが、ノイズある信号が蓄積される。
- managed runtime では prior 内容を解決できず常に `indeterminate` となるため、
  managed 環境では後出し検出が実質的に機能しない。

### Known Debt

- gate 化（後出し率に基づく verdict 変更）は信号の蓄積を見てから別 request で判断する。
  偽陽性率の実測値が閾値判断の根拠になる。
- managed runtime での prior 解決（`priorOid` からの file 取得）は対応しておらず、
  managed での後出し検出は将来の別 request として残る。
- code-review・conformance 等の他 judge step への配線は、spec-review での効果確認後に
  別 request で検討する。

## References

- Request: `specrunner/changes/spec-review-full-enumeration/request.md`
- Design: `specrunner/changes/spec-review-full-enumeration/design.md`
- Spec: `specrunner/changes/spec-review-full-enumeration/spec.md`
- Implementation: `src/core/step/finding-recency.ts` / `src/core/step/commit-orchestrator.ts` /
  `src/prompts/spec-review-system.ts` / `src/store/event-journal.ts` /
  `src/core/port/runtime-strategy.ts`
- Related: [ADR-20260723-spec-review-fixer-routing](2026-07-23-spec-review-fixer-routing.md)
  — spec-review の verdict 導出と fixer routing 規則（本 ADR はその上に重なる観測層を追加する）
