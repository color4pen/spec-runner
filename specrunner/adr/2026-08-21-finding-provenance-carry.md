# ADR: regression-gate finding の由来を機械的に保持し、--wontfix 解決を識別子照合に切り替える

**Date**: 2026-08-21
**Status**: Accepted
**Request**: finding-provenance-carry

## Context

`job resume --wontfix <index>` は regression-gate が報告した finding に対して
operator が「won't fix」の disposition を記録するコマンドである（#1022 で実装）。
変更前の解決機構は以下の手順で動作していた：

1. 最新 regression-gate の typed findings から operator が選択した index を取得する。
2. `deriveImplReviewerChain(state)` の StepRun findings から `fingerprint (file|line|title) → Map<stepName, Finding>` の逆引き索引を構築する。
3. 各 gate finding の fingerprint を再計算し、索引と照合する。一致しなければ all-or-nothing で失敗し resume は exit 2 となる。

この機構には 2 つの構造的欠陥があった：

**欠陥 1: LLM title 言い換えによる fingerprint ミスマッチ**
regression-gate は LLM reviewer であり、ledger finding を再報告する際に title を言い換える
（実測: 「〜の範囲が曖昧 — …」→「〜の範囲が**依然として**曖昧」）。
`findingFingerprint` は `file|line|title` で構成されるため、title が変わると再計算した
fingerprint が発生元 finding のものと一致しなくなり、正当な `--wontfix` 操作全体が
exit 2 で拒否される。実測エラー:
`--wontfix: index 1 finding fingerprint '<file>|<line>|<title>' not found in any reviewer chain step`

**欠陥 2: spec-review 由来 finding が逆引き対象外**
regression-gate の ledger は `collectSpecReviewLedger`（spec-review StepRun の fixable findings）と
`collectFindingsLedger`（impl reviewer chain）を合流した結果であるが、逆引き索引は
`deriveImplReviewerChain` のみを走査する。spec-review 由来の finding は title が完全一致しても
発生元に到達できない確定バグ。title 保存だけでは修正できない構造的欠陥。

根本原因は **再生成された prose から identity を復元しようとする設計** にある。
本変更はこの設計を捨て、「由来を最初から運び、照合を機械的識別子で行う」形に切り替える（issue #1037）。

## Decision

### D1: 再生成 prose からの identity 復元を廃止し、機械的 provenance ref を導入する

発生元 finding から gate 再報告 finding への対応付けは、LLM が再生成したフィールド（title / rationale）
の文字列照合ではなく、機械が付与した不透明な provenance ref によって行う。

ref は発生元 finding の stable fingerprint（`findingFingerprint` = `file|line|title`）から
決定論的に導出する（`computeLedgerRef`）。同一 fingerprint には常に同一 ref が対応し、
ledger のメンバーシップや順序に依存しない。

**採用理由**: `findingFingerprint` は `title` を含む。LLM による title 言い換えが 1 回起きるだけで
照合が外れ、resume 全体が拒否される。不透明なトークンを機械が付与し LLM がそれを transport するだけにすることで、
再生成テキストへの依存を完全に排除できる。これは request に明記された主線（「由来を最初から運ぶ」）と一致する。
→ A1, A2 を否採用

### D2: gate が ref を echo する方式 + machine validation（echo path + fail-closed）

provenance ref は regression-gate の ledger ブロックに表示し、gate が reported finding に
echo する形で運ぶ。resolution 時は機械が echo された ref を検証し、ledger 寄与 step に
解決できない場合は all-or-nothing で失敗（exit 2、zero records）とする。

- ref は optional フィールドとして typed schema に追加（D5 参照）
- echo 指示は regression-gate プロンプトにスコープし、spec-review / code-review の
  tool description は変更しない
- ref が欠如・不正な gate finding が 1 つでも存在すれば operation 全体が失敗

**採用理由**: `--wontfix <index>` の index は gate が **選択して報告した** regressions に対応する。
gate が ledger の全エントリではなく一部を選択した上で任意の順序で報告するため、
機械は「どの ledger エントリを gate が選んだか」を gate のアウトプットなしに知る手段がない。
何らかの LLM-carried linkage は不可避である。ref を不透明なトークン（prose でない）とし、
欠如・不正を fail-closed で扱うことで、誤った disposition が記録されるリスクはゼロ。
→ A3, A4 を否採用

### D3: provenance ref は fingerprint の内容から導出し、positional index は使わない

`computeLedgerRef(finding)` は `findingFingerprint(finding)`（`file|line|title`）を入力とする
決定論的・衝突耐性のある短い文字列を返す。ledger 内の位置（L1, L2, …）は使用しない。

**採用理由**: ledger のメンバーシップは resume 間で変化する（`filterUndecidedFindings` が適用されるため、
finding が disposition されると ledger が縮退し positional 番号がずれる）。
内容から導出した ref は ledger の shrink / reorder に依存せず、
gate が echo した ref を resume 時に同一アルゴリズムで再計算できる。
→ A5, A6 を否採用

### D4: wontfix の provenance index を ledger 寄与 step 全体（spec-review 含む）に拡張する

`--wontfix` 解決用の provenance index を構築する際は、spec-review StepRuns と
impl reviewer chain StepRuns の両方を走査する（`computeRegressionLedger` が見るのと
同じ source set）。ref → `Map<stepName, Finding>` の形で索引を作る。

また `collectSpecReviewLedger` に `filterUndecidedFindings` を追加し（impl chain 側と対称）、
disposition 済みの spec-review finding が ledger から除外されるようにする。

**採用理由**: spec-review 由来の finding が逆引き不能である原因は、旧索引が `deriveImplReviewerChain`
しか走査しなかったことにある（確定バグ）。索引の source set を ledger 計算と同じにすれば
「ledger に現れるが索引に無い finding」が原理的に存在しなくなる。
→ A7, A8 を否採用

### D5: スキーマ変更は additive-only。JUDGE_REPORT_TOOL singleton と DispositionDecisionRecord の形は維持する

- `Finding` インターフェースと `findingSchema`（`JUDGE_REPORT_TOOL` が使う zod スキーマ）に
  `ledgerRef?: string` を optional として追加する。
- `parseFindings` に `ledgerRef` の capture を追加する（`fixTarget` / `origin` / `fileMissing`
  と同様の方式）。非 string / 欠如は silently ignore とし missing-field エラーは発生させない。
- echo 指示は regression-gate プロンプトにのみ追記する（共有 tool description は変更しない）。
- `JUDGE_REPORT_TOOL` オブジェクトの identity は変更しない。
- `DispositionDecisionRecord` の shape と `decisions` の persisted 形式は変更しない。

**採用理由**: additive-optional にすることで、既存の finding 消費者（report tool / 表示 / 台帳 /
spec-review / code-review / conformance）はすべて無改変で動作し続ける。
`parseFindings` は finding を field-by-field に再構築するため、明示的な capture なしに
`ledgerRef` は parsing 後に消失する（既存の `fixTarget` 等と同じ問題）。
`DispositionDecisionRecord` を変更しないことで、#1022 で確立した persisted format 後方互換要件を満たす。
→ A9, A4 を否採用

### D6: operator の index 選択対象は gate 報告 finding のまま維持する

`--wontfix <index>` の index は最新 regression-gate typed findings への 1-based index として
引き続き機能する。変わるのは解決機構（fingerprint 照合 → ref 照合）と
索引対象（impl chain のみ → 全 ledger 寄与 step）のみ。

**採用理由**: operator は regression-gate のエスカレーション通知で gate が報告した regressions を見ている。
gate 報告 finding の番号に対して disposition するという operator の mental model を変えると UX が混乱する。
→ A10 を否採用

## Alternatives Considered

### A1: `file|line` のみで照合する（title を fingerprint から除外）

title を identity に含まず `file|line` のみで逆引きする案。

- **Pros**: LLM の title 言い換えに強くなる。既存 fingerprint を変えずに実現できる。
- **Cons**: 同一ファイルの同一行に複数 finding がある場合に曖昧。更に、`computeFindingKey` / `findingFingerprint` の再設計に相当し、スコープ外の変更が必要。spec-review 逆引き欠如も解決しない。
- **Why not**: D1 で否採用。fingerprint 式の再設計は scope-out（request 明記）。由来を最初から運ぶ方が根本解決。

### A2: gate に title を verbatim で保持させる prompt 契約を結ぶ

regression-gate のプロンプトに「title を一字一句変えず echot せよ」と指示する案。

- **Pros**: finding schema を変えない。既存の fingerprint 照合がそのまま使える。
- **Cons**: LLM での verbatim 保持は強制不可能（実測でも言い換えが起きた）。spec-review 由来 finding の逆引き欠如はそもそも title が一致していても解決しない。typed schema + machine validation による強制手段がない。
- **Why not**: D1 で否採用。request に「verbatim 保持は unenforceable」と明記されている。欠陥 2 を修正できない。

### A3: gate echo なし・機械が ledger 全体から disposition 対象を選択する純粋 machine-side 方式

`--wontfix <index>` の index を gate findings ではなく計算済み ledger の全件に向け直し、
gate のアウトプットから独立して解決する案。

- **Pros**: LLM transport に依存しない。gate が ref を omit / 改変する故障モードがなくなる。
- **Cons**: operator の index 選択対象が「gate が報告した regressions」から「ledger 全件」に変わる。operator は escalation で gate 報告分だけを見ており、ledger 全件を知らない。受け入れ基準が gate 報告 finding への `--wontfix` を明示しており、operator UX が壊れる。
- **Why not**: D2 で否採用。operator の mental model（gate が提示した findings の番号を指定する）を維持することが要件。

### A4: `REGRESSION_GATE_REPORT_TOOL` を新設して gate 専用 tool を持たせる

`JUDGE_REPORT_TOOL` から分岐した gate 専用ツールを作り、`ledgerRef` を必須フィールドとして定義する案。

- **Pros**: ref の存在を型レベルで保証できる。gate にだけ適用されるスキーマを安全に定義できる。
- **Cons**: `isJudgeStep` は `JUDGE_REPORT_TOOL` singleton の identity check（`stepReportTool === JUDGE_REPORT_TOOL`）。新 tool を使うと verdict 導出・ref 検証・no-tool-call escalation の judge-contract wiring が壊れ、executor に大きな変更が必要になる。変更範囲が本来の目的（provenance transport）に対して不相応に広い。
- **Why not**: D2 および D5 で否採用。singleton identity の維持が前提条件として確認されている。

### A5: positional `L{n}` id を provenance ref として使う

ledger 構築時に `L1`, `L2` … という連番を各 finding に割り振り、gate がそれを echo する案。

- **Pros**: シンプルで人が読みやすい。実装が軽量。
- **Cons**: ledger のメンバーシップは resume 間で変化する（`filterUndecidedFindings` による縮退）。finding が disposition されると ledger が shrink し番号がずれる。gate が `L3` を echo したが resume 時に `L3` が別の finding を指す、という状況が生じる。
- **Why not**: D3 で否採用。positional id は ledger membership change に対して不安定。

### A6: `file|line|title` 全文を provenance ref として使う

finding の fingerprint 文字列をそのまま ref として使い、gate がそれを echo する案。

- **Pros**: 追加の hash 計算が不要。fingerprint = ref なので実装が簡単。
- **Cons**: `file|line|title` の文字列は長く、特殊文字（パイプ等）を含む場合がある。LLM が verbatim に echo しにくく、部分的な omit / 改変が起きやすい。長い文字列は token 消費も多い。
- **Why not**: D3 で否採用。短い stable hash の方が echo 信頼性が高く、collision resistance も設計できる。

### A7: 索引を impl chain のみに保ちつつ `collectSpecReviewLedger` への title 保存で修正する

spec-review finding の title を逆引き索引に合わせて保持し、fingerprint 照合を改善する案。

- **Pros**: 索引側の変更が最小（impl chain のみ）。
- **Cons**: spec-review 由来 finding が impl chain の逆引き索引に存在しない、という欠陥 2 はそもそも title 照合の問題ではない。title を verbatim に保存しても spec-review StepRun が索引対象にならない限り逆引きは成立しない。
- **Why not**: D4 で否採用。索引対象が ledger に寄与する全 step を網羅しない限り根本解決にならない。

### A8: `computeRegressionLedger` の dedup 出力を provenance index として再利用する

既存の ledger 出力（dedup 済み）をそのまま逆引き索引の素材として使う案。

- **Pros**: 新たなステップ走査ロジックを書かなくて済む。ledger 計算との一貫性が高い。
- **Cons**: `dedupeFindings` は first-occurrence しか保持しないため、同一 fingerprint を複数 step（例: spec-review と code-review の両方）が報告している場合に片方の attribution が失われる。per-step の DispositionDecisionRecord を生成できない（TC-004: 1 finding に複数 step の record が必要）。
- **Why not**: D4 で否採用。索引は source StepRuns を直接走査して per-step attribution を保持する必要がある。

### A9: `DispositionDecisionRecord` に `ledgerRef` を新規フィールドとして追加する

disposition record に ref を永続化し、将来の検索や audit に活用できるようにする案。

- **Pros**: disposition の由来をより詳細に永続化できる。デバッグが容易になる。
- **Cons**: `decisions` の persisted format を変更することになり、#1022 で確立した後方互換要件を破る。provenance ref は ledger → resolution の一時的な transport 媒体であり、record に永続化する必要がない（`step + findingKey` で十分に機能する）。
- **Why not**: D5 で否採用。persisted format の変更は不要かつ後方互換コストが高い。

### A10: index の選択対象を ledger 全件に向け直す（D6 の対案）

`--wontfix <index>` の index を gate findings ではなく ledger の全エントリに対応させる案。
A3 の再掲だが D6 文脈でも検討した。

- **Pros**: gate が ref を echo する必要がなくなる。LLM 依存を完全に除去できる。
- **Cons**: operator が escalation で目にするのは gate が選択した regressions のみ。ledger 全件は表示されておらず、operator は選択対象を判断できない。受け入れ基準（「gate が title を言い換えて再報告した finding への `--wontfix`」）と矛盾する。
- **Why not**: D6 で否採用。operator の mental model を維持することが最優先。

## Consequences

### Positive

- `--wontfix` が LLM の title 言い換えに影響を受けなくなる。gate が任意に title を
  paraphrase しても disposition は成功する（欠陥 1 解消）。
- spec-review 由来 finding への `--wontfix` が成立する（欠陥 2 / 確定バグ修正）。
- 発生元の特定が `findingKey(step, finding)` によって一意に決まるため、
  disposition record の正確性が向上する。
- 失敗は全件 fail-closed（exit 2, zero records）のため、誤った disposition は生まれない。

### Negative / Trade-offs

- LLM が ref を omit / 改変すると、その finding への `--wontfix` は失敗する（fail-closed）。
  operator は再度 gate を走らせて ref 付きの report を得る必要がある。
- `parseFindings` および `Finding` interface にフィールドが増えた。
  非 regression-gate step では常に `undefined` であり、将来の finding consumer は
  optional として扱う必要がある。

### Neutral

- `computeFindingKey` / `findingFingerprint` の識別式自体は変更していない。
  `computeLedgerRef` はそれらの上位層として動作する。
- 既存の disposition machine-respect（step + findingKey フィルタ）は無改変。
- `FIXED / STILL PRESENT` 判定ロジックは無改変。
- `decisions` の persisted format は無改変（後方互換維持）。

### Future work

- ref が欠如した fixable gate finding をエスカレーション時に reject する gate verdict 強化は
  意図的に scope-out（gate verdict logic は freeze 中）。将来の独立した変更候補。
- sibling: artifact provenance（bite-evidence tamper, issue #1036）は「出自を最初から運ぶ」
  原則を共有するが、修正対象と壊れ方が異なるため別 request とする。

## References

- Request: `specrunner/changes/finding-provenance-carry/request.md`
- Design: `specrunner/changes/finding-provenance-carry/design.md`
- Spec: `specrunner/changes/finding-provenance-carry/spec.md`
- Issue: #1037（finding provenance carry）
- Predecessor: `specrunner/adr/2026-08-20-finding-wontfix-disposition.md`（#1022, `decisions` 台帳の確立）
- Implementation: `src/kernel/report-result.ts` / `src/core/step/report-tool.ts` /
  `src/core/port/report-result.ts` / `src/core/pipeline/findings-ledger.ts` /
  `src/core/decision/wontfix.ts` / `src/core/step/regression-gate.ts` /
  `src/prompts/regression-gate-system.ts`
