# 軽量 `fast` pipeline を追加し、permissionScope を宣言する最初の profile とする

**Date**: 2026-06-14
**Status**: accepted
**Related**:
- `specrunner/adr/2026-06-14-pipeline-scope-declaration-machine-escalation.md`（permissionScope / scope-check / checkpoint）
- `specrunner/adr/2026-06-14-scope-unevaluable-fail-closed.md`（canDeriveChangedFiles / RealRuntimeStrategy）
- `specrunner/adr/2026-06-14-pipeline-selection-capability-gate.md`（pipeline 選択 / assertRuntimeSupportsScope）
- `specrunner/adr/2026-06-04-pipeline-descriptor-registry.md`（PipelineDescriptor / PIPELINE_REGISTRY）

## Context

#689（scope 宣言＋超過の機械導出）／#692（評価不能 runtime の fail-closed）／#693（pipeline 選択機構＋汎用 capability gate）で scope 機構の土台は揃っていた。しかし `PIPELINE_REGISTRY`（`src/core/pipeline/registry.ts`）に `permissionScope` を宣言する profile が 1 つも無く、3 つの機構はすべて production で inert（発火しない）状態だった。

具体的に「inert」であるとは:
- `computeExtraScopeFindings`（`scope-check.ts`）は `permissionScope` absent で `[]` を返して即終了する（#689）。
- `assertRuntimeSupportsScope`（`runtime-capability-gate.ts`）は `descriptor.permissionScope !== undefined` が偽のため無条件フォールスルーする（#693）。
- `canDeriveChangedFiles?.() === false` 判定（#692）も、`permissionScope` を持つ descriptor が存在しないので到達しない。

本変更は **最初の利用者** = 軽量 `fast` pipeline を registry に追加することで、この 3 機構を production で初めて起動する。「軽量」とは「深さと重複レビューを削る」ことであって「安全網を削る」ことではない。verification ループ・code-review ループ・conformance（＋ scope checkpoint）は残し、削るのは spec-review / spec-fixer / test-case-gen / adr-gen に限定する。

## Decision

### D1: fast の steps — spine 7 + 残存 loop の fixer 2 = 9 entry

`FAST_DESCRIPTOR` の steps を以下で構成する。spine（happy path）は 7 step、これに verification ループと code-review ループが自己修復するために必要な fixer 2 step を加えた計 9 entry とする:

| # | step | 役割 |
|---|------|------|
| 1 | `request-review` | startStep / gate |
| 2 | `design` | creator / spec |
| 3 | `implementer` | creator / impl |
| 4 | `verification` | gate（CLI step） |
| 5 | `build-fixer` | verification の fixer |
| 6 | `code-review` | reviewer / impl |
| 7 | `code-fixer` | code-review の fixer |
| 8 | `conformance` | acceptance gate ＋ scope checkpoint |
| 9 | `pr-create` | terminal（CLI step） |

**除外するもの**: `spec-review` / `spec-fixer` / `test-case-gen` / `adr-gen`。Step オブジェクトは既存（`RequestReviewStep`〜`PrCreateStep`）をそのまま再利用し、fast 専用の新規 Step は作らない。

**fast = 深さを削るが安全網は削らない**: spec-review は design フェーズの深さ（独立仕様レビューの繰り返し）であり、test-case-gen・adr-gen は後工程の追加 step である。これらを除外することで工程を圧縮する。一方、verification ループと code-review ループの fixer（`build-fixer` / `code-fixer`）は「ループが自己修復できること」の実体であり、削ると安全網を失う。fixer を除外すると verification 失敗→ escalate 一択になり、「軽いが net 付き」の設計に反する。

**遷移テーブルの差分**（`STANDARD_TRANSITIONS` 比）:
- `design success → spec-review` を `design success → implementer` に変更。
- spec-review / spec-fixer / test-case-gen / adr-gen の全遷移行を削除。
- `conformance approved → adr-gen` を `conformance approved → pr-create` に差し替え。
- code-review ループは `buildReviewerChainTransitions(["code-review"])` を標準と同じ生成器で構成（chain 末尾 → `conformance`）。
- reverification ガード 2 本（`conformanceApprovedLatest` / `codeChangedSinceLastVerification`）は保持し、`when` 付き行を無条件行より前に置く（`transitions.find` 先頭一致のため）。

**`needs-fix:spec-fixer` を持たない**: `deriveConformanceVerdict` が `fixTarget: spec-fixer` の finding で `needs-fix:spec-fixer` を返したとき、FAST_TRANSITIONS に一致行が無いため `pipeline.ts:298` の `?? "escalate"` でフォールバックする。これは意図した挙動—spec/design レベルの修正を要する変更は fast の slim 前提に合わず、人間にエスカレーションするのが正しい。

### D2: permissionScope — checkpoint=`conformance`、3 forbidden surfaces

`FAST_DESCRIPTOR.permissionScope` を以下で宣言する:

```typescript
permissionScope: {
  checkpoint: "conformance",
  forbidden: [
    { id: "public-types",      paths: ["src/core/port/**"] },
    { id: "persisted-format",  paths: ["src/state/schema.ts"] },
    { id: "state-transitions", paths: ["src/state/lifecycle.ts"] },
  ],
}
```

**checkpoint = `conformance`**: fixer（code-fixer 等）が diff を変え終えた後の、最終 diff が出揃う最後の judge step。`executor.ts:640` の `isConformanceStep` が conformance を checkpoint として認識し、#689 の `computeExtraScopeFindings` を呼ぶ（#689 の checkpoint 制約=judge step を満たす）。

**3 surfaces の選定根拠**:
- `public-types`（`src/core/port/**`）: Ports & Adapters の公開インターフェース境界全体。`**` glob により配下の任意ファイルを覆う。fast の軽量 review 経路で公開契約を変えると downstream 破壊が検知できなくなる。
- `persisted-format`（`src/state/schema.ts`）: JobState の永続スキーマ。スキーマ変更は互換性の問題を引き起こし、既存 state との非互換が silent corruption になる。
- `state-transitions`（`src/state/lifecycle.ts`）: state-transition 表。変更すると状態機械の実行可能性が変わり、全 pipeline の制御フローに影響する。

この 3 アンカーは「軽い経路で勝手に触られると影響が広い構造境界」であり、surfaces 1–3 が大構造変更を推移的に捕まえる。fast 変更がこれらに触れたとき conformance で機械検出され、`decision-needed` finding（`origin:"scope"`）→ escalation となる。

### D3: gate は permissionScope 宣言で自動継承する（fast 固有の分岐を作らない）

非対応 runtime（`canDeriveChangedFiles?.() === false`、managed）で `fast` を選んだときの着手前 reject は、#693 の `assertRuntimeSupportsScope`（`runtime-capability-gate.ts`）が `FAST_DESCRIPTOR.permissionScope !== undefined` を検出することで**自動的に**発火する。`pipeline-run.ts` にも gate にも `pipelineId === "fast"` のような profile 名分岐を一切追加しない。

これにより `fast` は **scope を宣言することで gate を継承する**。将来の scope 宣言 profile も同じパターンで自動的に gate を得る。gate をすり抜けた場合の UNKNOWN/breach escalation（#689）が backstop として働く（多層防御）。

### D4: adr-gen を持たず、ADR 必要な変更は fast 不適格

fast は `adr-gen` step を含まない。「fast の slim design 前提（独立 spec-review・深い設計文書なし）」と「ADR 要求（構造的な新判断の記録）」は衝突しやすいため、ADR が必要と判断される変更は fast 不適格として standard への転送を促す。

この方針は本変更自体の実行経路にも適用される: 本変更（pipeline registry と実行契約を変える構造変更）は **standard pipeline で実行し、ADR を生成する**。「fast profile が adr-gen を持たない」という挙動仕様とは軸が異なる（前者は本変更の実行経路、後者は fast profile の挙動）。

### D5: design 成果物は残し、slim は構造で encode する（prompt 変更なし）

- `design` step を fast steps に含め、design.md / tasks.md / spec.md は従来どおり生成する（共有 `DesignStep` を再利用、prompt 不変）。fast が落とすのは「独立 spec-review ループの深さ」であって design 成果物ではない。
- 「test-case-gen を implementer に統合」は構造で表現する: fast に `test-case-gen` step が無く、`implementer`（既存の `ImplementerStep`、責任範囲に「source code, tests」を含む）が impl フェーズでテストも生成する。`ImplementerStep` の prompt は変更しない（共有 step なので変更すると standard に波及する）。
- 「全件 design を残してきた一貫性」を崩さず深さだけ圧縮し、step の取捨だけで slim を実現することで per-profile 分岐と新規 Step を最小化する。

## Alternatives Considered

### A1: build-fixer を fast から除いて verification 失敗→ escalate にする

- **Pros**: step 数をさらに減らせる
- **Cons**: verification が自己修復できなくなり「安全網は削らない」に反する。small build fix のたびに escalation が必要になり、軽量化の恩恵を打ち消す
- **Why not**: 却下。fixer は安全網の実体であって「深さ」ではない

### A2: fast 専用の Step（augmented implementer 等）を新設する

- **Pros**: fast 固有の prompt やロジックを per-profile で書ける
- **Cons**: 新規 Step は surface を増やし per-profile 分岐を生む。「既存 step 不変」を崩し、shared step との 2 箇所メンテナンスになる
- **Why not**: 却下。既存 step の取捨だけで構成する

### A3: checkpoint = code-review にする

- **Pros**: code-review の時点でスコープを確認できる
- **Cons**: code-fixer がその後に diff を変えうるため、code-review の時点では最終 diff が出揃っていない。scope を「通過した変更の最終形」に対して評価できない
- **Why not**: 却下。conformance が fixer 後の最終 diff を見る最後の judge step

### A4: forbidden surfaces に個別ファイルを列挙する（`src/core/port/**` の代わりに個別）

- **Pros**: 検出が精密になる
- **Cons**: port/ 配下にファイルが追加されるたびに forbidden list を更新する維持負荷が生じる。glob 1 本が境界全体を将来追加ファイルも含めて覆える
- **Why not**: 却下。`src/core/port/**` の 1 glob で十分

### A5: 新規トップレベル module（surface 4）を forbidden に含める

- **Pros**: より広い構造変更を捕まえられる
- **Cons**: 「どのパスが既知でどのパスが新規か」は allowlist 概念で `ForbiddenSurface.paths` の denylist-glob モデルに乗らない。surfaces 1–3 が大構造変更を推移的に捕まえるため必要性も低い
- **Why not**: 却下。別軸（magnitude / allowlist）として後回し

### A6: needs-fix:spec-fixer を conformance → implementer にマップする

- **Pros**: spec/design 修正を fast で完結させられる
- **Cons**: implementer は design.md を直接編集できない（責任範囲外）。spec/design の修正を実装者に強制すると不誠実な前進になる。escalation が正直
- **Why not**: 却下。意図的に行が無い → `?? "escalate"` フォールバックが正しい挙動

### A7: pipeline 名分岐（`pipelineId === "fast"`）で gate を実装する

- **Pros**: gate ロジックが明示的で追いやすい
- **Cons**: scope 宣言 profile が追加されるたびに gate を修正する負債になる。受け入れ基準・architect 判断で明示的に禁止されている
- **Why not**: 却下。`permissionScope !== undefined` からの導出で gate を共有する（D3）

### A8: adr-gen を fast に含めてオプショナル扱いにする

- **Pros**: fast でも必要に応じて ADR を出せる
- **Cons**: ADR 要求が出る変更は設計の複雑さを示すシグナルであり、slim review 経路に乗せるべきでない。fast のエントリーポイントが「ADR いる？」という判断を毎回求める設計になる
- **Why not**: 却下。ADR 必要な変更は fast 不適格として standard へ誘導する

## Consequences

### Positive

- #689（scope-check）/ #692（fail-closed）/ #693（capability gate）の 3 機構が production で初めて起動する。土台の実用検証が行われる。
- 将来の scope 宣言 profile は `permissionScope` を descriptor に宣言するだけで capability gate（着手前 reject）と checkpoint escalation（backstop）を自動継承する。gate を追加実装する必要が無い。
- `standard` / `design-only` の descriptor・挙動・既存テストは完全に無変更のまま（additive）。
- 3 forbidden surfaces（public-types / persisted-format / state-transitions）が「fast で勝手に触ってはいけない構造境界」として明示的に記録され、将来の scope 宣言の参照点になる。
- design 成果物を残すことで「全件 design を残してきた一貫性」が維持される。slim は深さの圧縮のみであり、landed 決定の trace は保たれる。

### Negative / Known Debt

- `STANDARD_TRANSITIONS` に隣接して `FAST_TRANSITIONS` を `types.ts` に置く構成により、遷移テーブルの宣言ファイルが肥大化する。profile 数が増えたとき別 file への分割を検討する。
- `ImplementerStep` の prompt は fast / standard で共用のため「fast では test も書く」という文脈注入はできない。実際には `ImplementerStep` の既存 remit（tests を含む）で十分だが、fast 専用の強調が無い分、テスト生成の網羅性は reviewer/conformance の semantic finding に依存する。
- `needs-fix:spec-fixer` が返された場合は escalation になるため、design/spec フェーズの問題が実装後の conformance まで持ち越されると遅い feedback になる。spec-review を持たないことのトレードオフとして許容する。
- fast はその性質上「ADR が必要か否か」の判断を request 作成者に委ねる。誤って fast を選んだ変更がスコープ内であれば conformance を通過するが、設計記録の欠如は後から見えない負債になり得る。

## References

- Request: `specrunner/changes/fast-pipeline/request.md`
- Design: `specrunner/changes/fast-pipeline/design.md`
- Spec: `specrunner/changes/fast-pipeline/spec.md`
