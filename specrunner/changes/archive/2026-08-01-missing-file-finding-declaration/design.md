# Design: 欠落指摘 finding の構造化宣言と finding-ref 反転検証

## Context

judge 系 step（regression-gate / spec-review / custom-reviewer / code-review / conformance /
request-review）は、session 終了後・verdict 確定前に finding-ref 実在検証（hallucination ガード）を
走らせる。`src/core/step/step-completion.ts:238-256` で、verdict に影響する finding
（`collectVerdictAffectingFindings` = severity critical/high または resolution decision-needed；
`src/core/step/judge-verdict.ts:26-30`）の `file`/`line` を
`runtimeStrategy.verifyFindingRefs` に渡し、1 件でも実在しない ref があれば導出済み verdict を
`escalation` に上書きし、`verdictOverriddenByFindingRef = true` を立てる。この flag が立つと
`step-completion.ts:300-321` の canon escalationReason 計算が抑止されるため、下流には routing
メタデータの無い素の escalation が渡る。

この検証は「finding は実在する箇所を指すはず」という前提を持つ。しかし「**あるべきファイルが
未作成**」という正当な指摘は、その定義上、存在しないファイルを `file` に書く。すると:

- verdict 導出単体では fixable として needs-fix 系 routing（例 `deriveRegressionGateVerdict` は
  任意 severity の fixable を needs-fix にする）が出る
- ところが ref 検証が「file が実在しない」を hallucination と誤認し `escalation` に上書きする
- さらに escalationReason も抑止されるため routing が完全に消える

実例（issue #916）: regression-gate が implementation-notes.md 未作成を指摘 →
本来 needs-fix → ref 検証が nonExistent 判定 → escalation 上書き →
operator が `resume --from code-fixer --prompt` で手動 routing。「欠落の指摘」がシステム上
表現不能になっている。

**根本原因**は、finding が「file の実在を前提に問題箇所を指す」のか「file の欠落そのものを指摘する」
のかを区別する構造が無く、ref 検証が一律に「実在」を期待している点にある。

### 現状コードの確定事実

- `Finding` 型（`src/kernel/report-result.ts:40-75`）: `file` は必須 worktree 相対パス。
  discriminator は `origin?: "scope"` のみ。欠落を表す専用フィールドは無い。
- 全 judge 系 report tool schema は `findingSchema`（`src/core/step/report-tool.ts:105-114`；
  JUDGE / CODE_REVIEW / REQUEST_REVIEW が共有）と `conformanceFindingSchema`（同 :181-191；
  CONFORMANCE 専用）の 2 つ。いずれも `file: string()` を持ち、欠落表現の規約は description に無い。
- runtime 実行時の finding 取り込みは hand-written `parseFindings`（`src/core/port/report-result.ts:178-236`）。
  zod schema は tool の input_schema 生成用（`toJSONSchema`）で、実 parse は parseFindings が担う。
  → **新フィールドは zod schema と parseFindings の両方に追加が必要**。
- seam `verifyFindingRefs` の契約（`src/core/port/runtime-strategy.ts:428-443`）:
  「実在しない ref の部分集合を返す」。local（`src/core/runtime/local.ts:752-781`）は
  `fs.stat` ベース、managed（`src/core/runtime/managed.ts:381-422`）は GitHub API ベース。
  managed は `branch === null` のとき全 ref を非実在として返す。
- custom-reviewer / regression-gate はいずれも `JUDGE_REPORT_TOOL` singleton を使う
  （`src/core/step/custom-reviewer.ts:115` / `src/core/step/regression-gate.ts:94`）ため、
  `findingSchema` への追加で両者ともカバーされる。

### request 記載事実の訂正（out-of-loop な観測差分）

request と fact-check attestation は「local `verifyFindingRefs` の単体テストは存在しない」と
記載するが、`tests/unit/core/runtime/verify-finding-refs.test.ts` に TC-VFR-L-001〜007 が実在し
local seam を直接検証している。本設計は seam 実装を変更しない（分岐は呼び出し側）ため方針に影響は
無いが、受け入れ基準「local / managed 両実装の分岐挙動をテストで固定する」は
**seam ではなく呼び出し側の反転ロジックを両 runtime 経由で固定する**意味に解釈して満たす
（seam の既存テストは無変更で green のまま）。

## Goals / Non-Goals

**Goals**:

- finding に「対象 `file` の欠落自体を指摘している」ことを構造化宣言する boolean フィールドを追加する。
- ref 検証を宣言別に分岐する: 欠落宣言 finding は「file が実在**しない**こと」を、非宣言 finding は
  従来通り「実在すること」を検証する。両方向とも宣言を現実と機械照合する。
- 欠落宣言が正しい（file が実在しない）場合、escalation 上書きを起こさず、verdict 導出の routing 付き
  結果を保存する。
- 欠落宣言が虚偽（file が実在する）場合は従来同様 escalation に上書きする（fail-closed 維持）。
- local / managed 両 runtime 経由で分岐挙動が同一であることをテストで固定する。

**Non-Goals**:

- `verifyFindingRefs` seam の意味論・シグネチャ変更（呼び出し側の分割で足りるため触らない）。
- ref 検証の対象集合（`collectVerdictAffectingFindings` = critical/high/decision-needed）の変更。
- escalationReason 抑止ロジック（`step-completion.ts:300-321`）の変更。虚偽宣言・非宣言 nonExistent の
  上書き時挙動は従来通り（escalationReason は付かない）。
- reviewer prompt 本文への欠落表現ガイドの大規模追記。契約は schema description 経由で注入する。

## Decisions

### D1: `Finding` 型と parseFindings に `fileMissing?: boolean` を追加

`src/kernel/report-result.ts` の `Finding` に optional な `fileMissing?: boolean` を追加する。
意味論: `true` のとき「この finding は `file` が指す path の欠落自体を指摘する」。absent/false は
従来挙動（file は実在する箇所を指す）と完全に同一。

`src/core/port/report-result.ts` の `parseFindings` で、`f["fileMissing"] === true` のときのみ
`finding.fileMissing = true` を設定する（`origin` と同じ silent-capture パターン。true 以外の値は
無視）。strict モードの options 検証等には影響しない。

**Rationale**: `origin?: "scope"` と同じ additive discriminator パターンを踏襲し、legacy 永続 finding
（フィールド無し）を無改変で従来挙動として扱える。名称 `fileMissing` は「file が missing」を素直に
読める。

**Alternatives considered**:

- enum 化（`kind: "present" | "missing"`）: 2 値の boolean で足り、既存 `origin` の粒度感と揃える方が
  一貫。将来 3 値目が必要になれば拡張すればよい。
- `file` を optional にして欠落を null で表す: `file` 必須という既存契約と多数の消費側前提を崩す。
  欠落宣言でも「どの path が欠けているか」は必要なので `file` は残すべき。

### D2: 4 tool schema の finding に `fileMissing` を追加し description に用途を明記

`src/core/step/report-tool.ts` の `findingSchema`（JUDGE / CODE_REVIEW / REQUEST_REVIEW が共有）と
`conformanceFindingSchema`（CONFORMANCE）の両方に `fileMissing: optional(boolean())` を追加する。
併せて JUDGE / CODE_REVIEW / CONFORMANCE / REQUEST_REVIEW の 4 tool description の finding 要素説明に
次の規約を追記する:

> `fileMissing?: boolean` — あるべきファイルが存在しないこと自体を指摘する場合に true。
> このとき `file` には欠落している path を書く（line は不要）。

**Rationale**: reviewer への契約は schema（input_schema）経由で注入するのが主手段で、prompt 本文の
増築を避ける（request 要件 1）。`boolean` は既に import 済み。custom-reviewer / regression-gate は
JUDGE_REPORT_TOOL を共有するため `findingSchema` の 1 箇所追加で網羅される。

**Alternatives considered**:

- prompt 本文でのみ規約を書く（schema 不変）: agent の遵守頼みで、破られたときの failure mode が現状と
  同じ（判断点が消えない）。却下（request 記載の architect 判断と一致）。

### D3: step-completion 呼び出し側で finding を宣言別に分割し、期待を反転する

`src/core/step/step-completion.ts:238-256` の ref 検証ブロックを次のように変更する。seam の
呼び出し方（`FindingRef[]` を渡し非実在部分集合を受け取る）と契約は不変で、**呼び出し側で findings を
2 群に分割し、欠落宣言群だけ期待を反転**する。

対象は従来通り `affectingFindings`（`collectVerdictAffectingFindings` の結果）に限定する。
分割:

- **非宣言群**（`fileMissing !== true`）: 従来通り `{ file, line }` の ref を検証。返却された非実在 ref が
  1 件でもあれば escalation 上書き（hallucination）。
- **欠落宣言群**（`fileMissing === true`）: `{ file }` の ref（line なし、D4）を検証。返却された
  非実在集合に**含まれない** file = 「実在してしまっている」= 虚偽宣言。虚偽宣言が 1 件でもあれば
  escalation 上書き。全て非実在（= 宣言が正しい）なら上書きしない。

いずれかの群が上書き条件を満たせば `verdict = "escalation"` / `verdictOverriddenByFindingRef = true`。
両群とも満たさなければ verdict 導出結果（routing 付き）をそのまま生かす。

虚偽宣言判定は「非実在集合の file 集合に自 file が含まれるか」で行う（seam は入力 ref を dedup せず
そのまま部分集合として返すため、file 文字列での集合照合が確実）。

**Rationale**: seam を不変に保ち（Non-Goal）、既存 seam テストと local/managed 実装を無改変にできる。
両方向（欠落宣言なのに実在 → 上書き、非宣言なのに不在 → 上書き）とも宣言を現実と機械照合するため、
自己申告が fail-open にならない。

**Alternatives considered**:

- ref 検証から欠落系 finding を単純に免除（検証しない）: 「存在しないファイルを指す finding は全部
  素通り」となり hallucination 検証が空洞化する。反転検証が正しい形。却下（architect 判断と一致）。
- seam に「反転フラグ」を渡してシグネチャ拡張: seam 意味論変更に当たり Non-Goal。呼び出し側の分割で
  足りる。
- 1 回の seam 呼び出しで全 ref を渡し返却を後から仕分ける: 同一 file が両群に現れた場合の同定が
  曖昧になる。群ごとに独立呼び出しする方が意味が明確（呼び出し回数増は無視できる I/O）。

### D4: 欠落宣言 finding では `line` を検証に使わない

欠落宣言群の `FindingRef` は `{ file }` のみで構築し `line` を渡さない。存在しないファイルに行は無く、
seam の line 超過判定（存在ファイル前提）を走らせないため。非宣言群は従来通り `{ file, line }`。

**Rationale**: 欠落宣言で `line` を渡すと、file が実在した場合（虚偽宣言）に line 判定が絡んで意味が
不定になる。宣言の主眼は「file の有無」なので line は捨てるのが正しい。

### D5: escalationReason 抑止は不変（両上書き経路とも従来挙動）

虚偽宣言・非宣言 nonExistent いずれの上書きも `verdictOverriddenByFindingRef = true` を立てる。
`step-completion.ts:300-321` の escalationReason 計算はこの flag で抑止されるため、両ケースとも
escalationReason は付かない（従来通り）。欠落宣言が正しく上書きが起きないケースでは flag は false の
ままで、canon escalationReason 計算は従来の条件で走る。

**Rationale**: request Non-Goal（escalationReason 抑止ロジック不変）。escalationReason 抑止の解除で
routing を復活させる案は、本物の hallucination 上書き時に誤った routing を生むため却下（architect 判断
と一致）。routing 復活は「上書き自体を起こさない」= D3 の反転検証で達成する。

### D6: runtime 対称性は seam 契約の runtime 非依存性で担保

反転ロジックは seam の「非実在部分集合を返す」契約のみに依存し、local/managed の実装差を知らない。
したがって呼び出し側ロジックは runtime 非依存で、同一 finding に対し local（temp worktree の
filesystem）と managed（mock GitHub API）が同じ非実在判定を返せば同じ verdict になる。これを
`deriveStepCompletion` に real `LocalRuntime` / real `ManagedRuntime` を注入する対称テストで固定する。

**Rationale**: 「分岐は local / managed 両実装経由で同挙動」（要件 5）を、seam を触らずに呼び出し側
テストで直接証明できる。

## Risks / Trade-offs

[Risk] managed runtime で `branch === null` のとき seam は全 ref を非実在として返す。欠落宣言群では
これが「全て非実在 = 宣言が正しい = 上書きしない」となり、検証不能なのに routing を保つ fail-open に
見える。
→ Mitigation: **pipeline 順序不変条件** — ref 検証が走る judge 系 step（regression-gate /
spec-review / custom-reviewer / code-review / conformance / request-review）は、pipeline の design step
で `state.branch` が確定した後にのみ到達できる。pipeline descriptor の transition テーブル構造上、
design step 完了前に judge 系 step が呼び出される経路は現状のコードベースに存在しない。したがって
判定時点で `state.branch` が null になる経路は存在しない。
この不変条件はコード（型/assertion）ではなく pipeline descriptor の遷移順序によって成立する構造的制約
である（seam シグネチャ変更は Non-Goal）。将来 pipeline descriptor に branch 確定前の judge step
遷移を追加した場合は不変条件が破れるため、pipeline 変更レビュー時にこの前提を確認すること。
非宣言群の branch=null → 全上書き（fail-closed）は従来通り不変。seam 意味論を変えない Non-Goal と
整合。

[Risk] 欠落宣言フィールドの誤用（実在ファイルに `fileMissing:true` を付ける等）。
→ Mitigation: 虚偽宣言（宣言 missing だが実在）は D3 で機械照合され escalation 上書きされる。逆も
同様に照合される。どちらの方向の自己申告も現実と突き合わされるため fail-open にならない。

[Risk] 既存永続 finding（`fileMissing` フィールド無し）の読み戻し。
→ Mitigation: absent は非宣言（`!== true`）として従来挙動に落ちる。additive かつ後方互換。

## Open Questions

なし。フィールド名は request で実装裁量とされているが、本設計では `fileMissing` に確定する
（`Finding.fileMissing` / schema の同名フィールド）。

<!-- spec-fixer-deferred: `branch = null` + 欠落宣言群の fail-open 緩和策が informal（コード保証なし） — pipeline 順序不変条件の ADR ファイル（specrunner/adr/2026-08-01-judge-step-branch-ordering-invariant.md）は spec-fixer の write scope 外（specrunner/adr/ が許可パスに含まれない）のため作成できず。不変条件の内容は上記 Risks 節に文書化した。adr-gen ステップで別途 ADR 化を推奨する。 -->
