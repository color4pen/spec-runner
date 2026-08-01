# ADR-20260801: 欠落指摘 finding の構造化宣言と split-and-invert ref 検証

**Date**: 2026-08-01
**Status**: accepted

Related: [ADR-20260723-canon-finding-escalation-routing](2026-07-23-canon-finding-escalation-routing.md)

## Context

judge 系 step（regression-gate / spec-review / custom-reviewer / code-review / conformance /
request-review）は step 完了後、verdict に影響する finding（severity critical/high または resolution
decision-needed）の `file` / `line` を `verifyFindingRefs` seam（非実在 ref の部分集合を返す）に
渡し、1 件でも非実在 ref があれば導出済み verdict を `escalation` に上書きする（hallucination ガード）。
上書き時は `verdictOverriddenByFindingRef = true` が立ち、escalationReason の計算が抑止される。

このガードは「finding は実在する箇所を指すはず」という前提を持つ。しかし **「あるべきファイルが
未作成」という正当な指摘**は、その定義上、存在しないファイルを `file` に書く。この場合:

- verdict 導出単体では fixable として needs-fix 系 routing が出る（例: `deriveRegressionGateVerdict`
  は任意 severity の fixable を needs-fix にする）。
- ところが ref 検証が「file が実在しない」を hallucination と誤認し `escalation` に上書きする。
- さらに escalationReason も抑止されるため routing が完全に消える。

実例（issue #916）: regression-gate が implementation-notes.md 未作成を指摘 → 本来 needs-fix →
ref 検証が nonExistent 判定 → escalation 上書き → operator が `resume --from code-fixer --prompt`
で手動 routing。「欠落の指摘」がシステム上表現不能になっていた。

**根本原因**: finding が「file の実在を前提に問題箇所を指す」のか「file の欠落自体を指摘する」のかを
区別する構造がなく、ref 検証が一律に「実在」を期待していた。

### 変更前の構造的事実

- `Finding` 型（`src/kernel/report-result.ts`）: `file` は必須 worktree 相対パス。discriminator は
  `origin?: "scope"` のみ。欠落を表す専用フィールドは無い。
- 全 judge 系 report tool schema は `findingSchema`（JUDGE / CODE_REVIEW / REQUEST_REVIEW 共有）と
  `conformanceFindingSchema`（CONFORMANCE 専用）の 2 つ。いずれも欠落表現の規約は無い。
- `parseFindings`（`src/core/port/report-result.ts`）: hand-written。zod schema は tool の
  input_schema 生成用で、実 parse は parseFindings が担う。新フィールドは両方への追加が必要。
- `verifyFindingRefs` seam 契約（`src/core/port/runtime-strategy.ts`）:「非実在 ref の部分集合を
  返す」。local は `fs.stat` ベース、managed は GitHub API ベース。

## Decision

### D1: `Finding` 型と parseFindings に `fileMissing?: boolean` を追加（additive discriminator）

`src/kernel/report-result.ts` の `Finding` に optional な `fileMissing?: boolean` を追加する。
意味論: `true` のとき「この finding は `file` が指す path の欠落自体を指摘する」。absent / false は
従来挙動（file は実在する箇所を指す）と完全に同一。

`parseFindings` では `f["fileMissing"] === true` のときのみ `finding.fileMissing = true` を設定する
（strict capture。false / 数値 / 文字列等は非宣言として扱う）。

`origin?: "scope"` と同じ additive discriminator パターンを踏襲するため、legacy 永続 finding
（フィールド無し）は無改変で従来挙動として扱われる。後方互換。

**採用理由**: `file` 必須という既存契約を崩さず、「どの path が欠けているか」を明示できる。
2 値 boolean で足り、将来 3 値目が必要になれば拡張すればよい。

### D2: 4 tool schema の finding に `fileMissing` を追加し description に用途を明記

`findingSchema`（JUDGE / CODE_REVIEW / REQUEST_REVIEW）と `conformanceFindingSchema`（CONFORMANCE）の
両方に `fileMissing: optional(boolean())` を追加する。各 tool description の finding 説明に:

> `fileMissing?: boolean` — set to true when the finding points to a file that should exist but is
> absent; in this case `file` contains the path that is missing (line is not needed).

を追記する。reviewer への契約は schema（input_schema）経由で注入し、prompt 本文の増築を避ける。
custom-reviewer / regression-gate は `JUDGE_REPORT_TOOL` を共有するため `findingSchema` の 1 箇所
追加で網羅される。

### D3: 呼び出し側で findings を宣言別に分割し、欠落宣言群の期待を反転する（split-and-invert）

`verifyFindingRefs` seam の意味論・シグネチャは不変のまま、**呼び出し側（step-completion.ts）で
`affectingFindings` を 2 群に分割し、欠落宣言群だけ期待を反転する**。

- **非宣言群**（`fileMissing !== true`）: 従来通り `{ file, line }` で ref を構築し seam に渡す。
  非実在 ref が 1 件でもあれば override（hallucination ガード）。
- **欠落宣言群**（`fileMissing === true`）: `{ file }` のみで ref を構築（line は渡さない、D4）。
  seam が返す非実在集合を `absentFiles` とし、`absentFiles` に含まれない file = 「実在してしまっている
  = 虚偽宣言」と判定。虚偽宣言が 1 件でもあれば override。全て非実在（= 宣言が正しい）なら override
  しない。

いずれかの群が override 条件を満たせば `verdict = "escalation"` / `verdictOverriddenByFindingRef = true`。
両群とも満たさなければ verdict 導出結果（routing 付き）をそのまま保持する。

**採用理由**: 両方向（欠落宣言なのに実在 → override、非宣言なのに不在 → override）とも宣言を現実と
機械照合するため、自己申告が fail-open にならない。seam を不変に保つため、既存 seam テストと
managed/local 実装を無改変にできる。

### D4: 欠落宣言 finding では `line` を検証に使わない

欠落宣言群の `FindingRef` は `{ file }` のみで構築し `line` を渡さない。存在しないファイルに行番号は
存在しないため（seam の line 超過判定を走らせない）。非宣言群は従来通り `{ file, line }`。

### D5: escalationReason 抑止は不変（両上書き経路とも従来挙動）

虚偽宣言・非宣言 nonExistent いずれの override も `verdictOverriddenByFindingRef = true` を立てる。
`step-completion.ts:300-321` の escalationReason 計算はこの flag で抑止されるため、両ケースとも
escalationReason は付かない（従来通り）。欠落宣言が正しく override が起きないケースでは flag は false
のままで、canon escalationReason 計算は従来の条件で走る。

routing の復活は「override 自体を起こさない（D3 の反転検証）」で達成する。

### D6: runtime 対称性は seam 契約の runtime 非依存性で担保

反転ロジックは seam の「非実在部分集合を返す」契約のみに依存し、local / managed の実装差を知らない。
`deriveStepCompletion` に real `LocalRuntime` / real `ManagedRuntime` を注入する対称テストで、
分岐挙動が runtime によらず一致することを固定する。

## Alternatives Considered

### A1: prompt 規約のみ（schema 変更なし）

file に実在する親ディレクトリや関連ファイルを書かせ、欠落対象は title/rationale で示す規約をプロンプト
本文に追記する。

- **Pros**: コードの変更が不要。
- **Cons**: agent の遵守頼みであり、破られたときの failure mode が現状と同じ（escalation + routing 消失）。
  判断点を消す方向でない。`LLM uncertainty principle`（根本対策は「agent が判断する場面を消す」）に反する。
- **Why not**: 採用しない。構造化宣言 + 機械照合が正しい方向。

### A2: 欠落系 finding を ref 検証から単純免除する

`fileMissing === true` の finding を検証対象から外し、seam を呼ばない。

- **Pros**: 実装が単純（条件分岐で skip するだけ）。
- **Cons**: 「存在しないファイルを指す finding は全部素通り」となり、hallucination 検証が空洞化する。
  虚偽宣言（fileMissing:true だが実際には file が実在する）が検出されない fail-open 構造になる。
- **Why not**: 採用しない。反転検証（D3）が正しい形。

### A3: escalationReason 抑止の解除で routing を復活させる

上書きが起きても escalationReason を計算することで、下流が routing を判断できるようにする。

- **Pros**: 既存の override ロジックを維持したまま routing を補完できる。
- **Cons**: 本物の hallucination（非宣言 nonExistent）の上書き時にも routing が付いてしまい、誤った
  fixer routing が発生する。「override が起きる = 信頼できない finding」という前提が崩れる。
- **Why not**: 採用しない。routing 復活は「override 自体を起こさない（D3）」で達成すべき。

### A4: seam シグネチャに「反転フラグ」を追加する

`verifyFindingRefs` に `inverted?: boolean` 等を渡し、seam 内で期待の反転を処理する。

- **Pros**: 呼び出し側の分割ロジックが不要になる。
- **Cons**: seam の意味論変更に当たり Non-Goal。seam テストと local/managed 実装を変更する必要が生じる。
  seam は「非実在 ref の部分集合を返す」という単純な事実関数であり、ドメインロジック（反転）を持たせる
  設計上の責任は呼び出し側にある。
- **Why not**: 採用しない。呼び出し側の分割（D3）で足りる。

## Risks

**[Risk] managed runtime で `branch === null` のとき seam は全 ref を非実在として返す。欠落宣言群では
「全て非実在 = 宣言が正しい = override しない」となり、検証不能なのに routing を保つ fail-open に見える。**

→ 詳細は [ADR-20260801-judge-step-branch-ordering-invariant](2026-08-01-judge-step-branch-ordering-invariant.md)
を参照。pipeline 順序不変条件（judge 系 step は必ず branch 確定後に到達する）によりこの経路は実行時に
存在しないことが構造的に保証されている。ただし、この不変条件はコード（型/assertion）ではなく pipeline
descriptor の遷移順序によって成立するため、pipeline 変更時に前提の確認が必要。

**[Risk] 欠落宣言フィールドの誤用（実在ファイルに `fileMissing:true` を付ける等）。**

→ 虚偽宣言（宣言 missing だが実在）は D3 で機械照合され escalation 上書きされる（逆も同様）。
どちらの方向の自己申告も現実と突き合わされるため fail-open にならない。

**[Risk] 既存永続 finding（`fileMissing` フィールド無し）の読み戻し。**

→ absent は非宣言（`!== true`）として従来挙動に落ちる。additive かつ後方互換。

## Consequences

### Positive

- 「あるべきファイルが未作成」という正当な指摘が、fixable であれば fixer routing されるようになる
  （issue #916 の実例クラスが systemic に解決される）。
- 両方向（欠落宣言なのに実在 → override、非宣言なのに不在 → override）の機械照合により、自己申告が
  fail-open にならない fail-closed 構造を維持する。
- seam の意味論・シグネチャが不変のため、既存 seam テストと local/managed 実装への変更がない。
- additive discriminator パターンにより後方互換。`fileMissing` フィールド無しの既存 finding は無改変で
  従来挙動として扱われる。

### Negative

- 欠落宣言群の override では escalationReason が付かない（D5、虚偽宣言・非宣言 nonExistent と同じ）。
  虚偽宣言の operator メッセージは routing メタデータ無しの素の escalation になる。
- 欠落宣言群が override 確定後も missingDecl 群の seam 呼び出しが走る（短絡最適化なし）。
  実運用上の I/O コストは無視できる範囲（`affectingFindings` は通常数件）。

### Known Debt

- `fileMissing: true` + `resolution: "decision-needed"` の組み合わせでは、`deriveJudgeVerdict` が
  decision-needed → escalation を ref 検証とは独立して確定させるため、ref 検証の override 有無が
  最終 verdict（escalation）に影響しない。escalationReason の有無のみ変わる（spec に Note として記録）。
- 虚偽宣言時の escalationReason 無しは改善の余地があるが、escalationReason 抑止ロジック変更は Non-Goal。
  別 request で対処するならば、「override 発生の理由分類（hallucination / 虚偽宣言 / 判定不能）」を
  stateに保存する方向が適切。

## References

- Request: `specrunner/changes/missing-file-finding-declaration/request.md`
- Design: `specrunner/changes/missing-file-finding-declaration/design.md`
- Spec: `specrunner/changes/missing-file-finding-declaration/spec.md`
- Implementation: `src/kernel/report-result.ts` / `src/core/port/report-result.ts` /
  `src/core/step/report-tool.ts` / `src/core/step/step-completion.ts` /
  `src/core/step/__tests__/step-completion-missing-file-finding.test.ts`
- Issue: #916（実例: regression-gate → implementation-notes.md 未作成指摘 → escalation 上書き）
- Related: [ADR-20260801-judge-step-branch-ordering-invariant](2026-08-01-judge-step-branch-ordering-invariant.md)
  — 欠落宣言群の fail-open リスクを封じる pipeline 順序不変条件
- Related: [ADR-20260723-canon-finding-escalation-routing](2026-07-23-canon-finding-escalation-routing.md)
  — 同じく routing 欠陥を修正した先行 ADR（書込不能 fixer への routing）
