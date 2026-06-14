# scope を評価できない runtime では breach を黙って通さず escalation する（fail-closed）— RuntimeStrategy に評価可能性 predicate を追加

**Date**: 2026-06-14
**Status**: accepted
**Related**:
- `specrunner/adr/2026-06-14-pipeline-scope-declaration-machine-escalation.md`（scope-check 基盤 / listChangedFiles seam）
- `specrunner/adr/2026-06-13-decision-options-ledger.md`（decision-needed / decision-ledger / filterUndecidedFindings）
- `specrunner/adr/2026-06-04-pipeline-descriptor-registry.md`（PipelineDescriptor / permissionScope）
- `specrunner/adr/2026-06-01-arch-invariant-enforcement-vitest-ratchet.md`（B-1〜B-10 arch 不変条件 / core-invariants grep）

## Context

#689（`2026-06-14-pipeline-scope-declaration-machine-escalation.md`）は、スコープ超過を `RuntimeStrategy.listChangedFiles` の changed-files から機械的に導出し `decision-needed` → escalation に載せる土台を入れた。しかしこの seam の戻り値 `string[]` の `[]` は実際には **3 状態を畳んでいる**:

- **(a)** 評価済みで変更なし
- **(b)** git エラー（local の `catch → []`、`src/core/runtime/local.ts`）
- **(c)** 評価不能（managed は worktree が無く構造的に常に `[]`、`src/core/runtime/managed.ts`）

この seam には **安全方向が正反対の 2 消費者** がいる:

- **消費者1 = reviewer activation**（`src/core/step/executor.ts`）。`[]` → パス条件マッチせず → reviewer を過少起動。skip は保守的なので **fail-safe**。
- **消費者2 = scope-check**（`computeExtraScopeFindings`、`src/core/step/scope-check.ts`）。`[]` → `deriveScopeBreach` が `breached:false` → **スコープ内として全通し**。これは **fail-open**。

とくに managed では `listChangedFiles` が構造的に常に `[]`（(c)）なので、managed 上で `permissionScope` を宣言した profile は「評価できなかった」を「スコープ内だった」と報告する。これは scope 機構の存在意義（責務を越えたら黙って通さない）と「記録は正直」原則の両方に反する。

本変更は #689 の機構の上に乗る土台ハードニングであり、managed で `permissionScope` を宣言した profile における構造的な fail-open の穴を塞ぐ。

## Decision

### D1: 評価可能性は port の predicate で表す（`listChangedFiles` の戻り値契約は触らない）

`RuntimeStrategy`（`src/core/port/runtime-strategy.ts`）に optional method を 1 つ追加する:

```typescript
canDeriveChangedFiles?(): boolean
```

意味:
- **absent** → `listChangedFiles` 経路へフォールスルー（＝現行挙動）。fail-closed scope 評価は発火しない。
- **`true`** → changed-files を導出できる（例: local の worktree）。
- **`false`** → changed-files を導出できない（例: managed、worktree が無い）。

`listChangedFiles` の戻り値型・契約（`string[]`、Never throws、`[]` on any error）は **変更しない**。predicate は seam のメタ情報として直交に追加するだけ。実装は local → `true`、managed → `false`。

**Rationale**: 支配的な穴は managed の構造的 `[]`（状態 (c)）であり、これは「この runtime は changed-files を導出できるか」という runtime-class のメタ情報で捕捉できる。`listChangedFiles` の戻り値を変えると、安全方向が正反対の activation 消費者（fail-safe を維持したい）の契約とテストを巻き込む。additive・optional な predicate は #689 の「optional / absent=現行」スタイルと同型で、activation 消費者・既存テストに非干渉。

### D2: predicate は optional（必須にしない）。absent はフォールスルー＝現行挙動

`canDeriveChangedFiles` を **必須** method にすると、`: RuntimeStrategy` / `as RuntimeStrategy` で full object を構成する既存 test fake（≈10 ファイル）が TS2741 で compile 不能になり、受け入れ基準「既存テスト無変更で green」と矛盾する。よって optional とする。

absent の意味は「評価不能」ではなく **#689 の既存経路（`listChangedFiles`）へフォールスルー＝現行挙動**。fail-closed 判定が効くのは predicate を明示実装した実 runtime（managed=`false`）のときだけ。predicate が `true` または absent のときは #689 の挙動（`listChangedFiles` → `deriveScopeBreach` → `synthesizeScopeFindings`）と完全一致する。

### D3: optional の残穴は実 runtime に対して型レベル＋ grep backstop で mechanical に固定する（本変更内で閉じる）

optional ＋「absent → フォールスルー（＝評価可能扱い）」は test fake を守る反面、将来 `src/core/runtime/` に追加される実 runtime が `canDeriveChangedFiles` を実装し忘れると黙って fail-open に戻る穴を作る。#689 の「機械的に導出する歯」思想に倣い、これを mechanical に固定する。Known Debt / follow-up に流さず本変更内で閉じる（cheap・on-thesis・deferral trap 回避）。

**型レベル（primary）**: port に必須版の型エイリアスを定義する:

```typescript
export type RealRuntimeStrategy = RuntimeStrategy & { canDeriveChangedFiles(): boolean }
```

`LocalRuntime` / `ManagedRuntime` を `implements RealRuntimeStrategy` に変更する（port `RuntimeStrategy` は optional のまま ＝ fake 非干渉）。将来の実 runtime が predicate を忘れると **コンパイル時に落ちる**。`runtimeStrategy: this`（`local.ts` / `managed.ts`）は field 型 `runtimeStrategy?: RuntimeStrategy`（`src/core/types.ts`）への部分型代入で通り、scope-check は従来どおり `RuntimeStrategy` 越しに `canDeriveChangedFiles?.()` を optional 呼び出しする。

**grep backstop（bypass 封じ）**: 型レベル pin は「新クラスが `implements RealRuntimeStrategy` と書く」前提なので、bare `implements RuntimeStrategy` と書けばすり抜ける。これを塞ぐため、既存 `core-invariants` の grep と同型の不変条件を 1 本追加する: **`src/core/runtime/` 配下に bare `implements RuntimeStrategy`（`RealRuntimeStrategy` ではない形）が出現しないこと**を検証する。predicate 以外の method が増えてもアサーション 1 本の維持コストで済む（#689 が警告した「各 method を grep する維持地獄」には陥らない）。`tests/` 配下の fake は対象外（optional の利便性を維持）。

型レベル（primary）と grep backstop（bypass 封じ）の二重化で、optional の利便性（fake 非干渉）と fail-closed の堅さ（実 runtime の取りこぼし防止）を両立する。

### D4: 評価可能性は runtime kind ではなく port predicate 越しに問う

scope-check（domain）が local / managed の kind を直接知るのは B-1（domain → adapter 非依存）／DSM 違反。評価可能性は `runtimeStrategy.canDeriveChangedFiles?.()`（port の predicate）越しに問う。scope-check は runtime の具象クラスを一切 import しない。#689 の「domain は port 越しにしか I/O メタ情報に触れない」原則を踏襲する。

### D5: UNKNOWN は breach と別 finding、ただし同一経路（純関数を scope.ts に追加）

`src/core/pipeline/scope.ts`（純関数 module）に `synthesizeScopeUnverifiableFinding(ctx)` を追加する。breach 合成（`synthesizeScopeFindings`）とは **title / rationale / options が異なる**が、以下は #689 と共有する:

- `origin: "scope"`、`resolution: "decision-needed"`、`severity: "high"`
- `file` = 決定的 anchor（当該 change の `request.md`）
- 固定文言で **決定的** に合成（同一 runtime 条件なら同一 `computeFindingKey`）

決定的 3 択（`≥2` 契約を満たす options）:
1. changed-files を導出できる runtime（例: local）で実行し直す
2. この profile の `permissionScope` 宣言を外す（以降 scope 検証は走らない）
3. scope 検証なしで進めることを受け入れる（リスク受容で前進）

scope を「検証できなかった」と「超過した」は別事象なので finding 文言・options を分ける。が、`decision-needed`・`origin:"scope"`・decision-ledger・escalation 導出は #689 のまま共有し、並行機構を新設しない。`FindingResolution` union は `fixable | decision-needed` のままで新 resolution 値を追加しない。

**fail-closed の既定は escalation であって拒否ではない**: 評価不能を自動却下せず人間に倒す。options に「リスク受容で進める」を含めることで、評価不能な runtime でも人間判断で前進できる逃げ道を残す（#689 の「出口は人間へ」を踏襲）。

### D6: fail-closed 分岐は scope-check の early guard 直後、`listChangedFiles` 呼び出し前に置く

`computeExtraScopeFindings` の既存 early guard（`permissionScope` 不在 / `stepName !== checkpoint` / `runtimeStrategy` 不在で `[]` return）の直後に fail-closed 分岐を追加する:

```typescript
if (deps.runtimeStrategy.canDeriveChangedFiles?.() === false) {
  return [synthesizeScopeUnverifiableFinding({ slug: deps.slug })];
}
```

- `=== false` の明示判定により absent / `true` をフォールスルーに畳む（optional 言語機能との整合）
- `listChangedFiles` を呼ばないことで「評価できないのに評価したふり」を構造的に排除する
- 合成した UNKNOWN finding は executor の `extraScopeFindings` 合流点（#689 と同じ経路）に乗り `decision-needed` → escalation に落ちる
- reviewer activation（`executor.ts`）は predicate を参照せず、`listChangedFiles` の戻り値・契約も変わらないため完全に無改変

## Alternatives Considered

### A1: `listChangedFiles` を discriminated return に変更する

```typescript
Promise<{ evaluated: true; files: string[] } | { evaluated: false; reason: string }>
```

- **Pros**: local の git エラー (b) まで fail-closed にできて最も正直
- **Cons**: activation 消費者の契約とテストを巻き込む。支配的な穴は managed の構造的 `[]`（(c)）であり predicate で捕捉できる。(b) の精密化はスコープ外（別変更）
- **Why not**: 却下。「1 request = 1 収束ループ」に反し、activation 消費者の大規模改修を引き込む

### A2: scope 専用の changed-files seam method を新設する

- **Pros**: 各消費者に固有契約を与えられて綺麗
- **Cons**: データ返却 seam の新設は #689 ADR（A5）で却下した「最小依存原則」に反する。predicate（メタ情報）の追加の方が軽い
- **Why not**: 却下

### A3: `canDeriveChangedFiles` を必須 method にする

- **Pros**: 新規 runtime は predicate を実装しなければ型エラーになる（一枚岩の機械固定）
- **Cons**: `: RuntimeStrategy` / `as RuntimeStrategy` で full object を構成する既存 test fake（≈10 ファイル）が TS2741 で compile 不能になり、AC「既存テスト無変更で green」と矛盾する
- **Why not**: 却下。D3 の型エイリアス＋ grep backstop で optional のまま同等の機械固定を得る

### A4: grep arch test のみ（型レベルなし）で固定する

- **Pros**: 型変更なしでシンプル
- **Cons**: コンパイル時に落ちる型レベルの方が歯として強い。`RealRuntimeStrategy` を primary に置くことで grep は「bypass 封じ」の補助的役割に収まり、維持コストが下がる
- **Why not**: 却下せず「secondary」として採用。型レベルを primary に置く

### A5: 型レベルのみ（grep backstop なし）で固定する

- **Pros**: ファイル数削減
- **Cons**: bare `implements RuntimeStrategy` と書けば型レベルをすり抜ける穴が残る。1 本の grep で塞げるのに塞がないのは deferral trap
- **Why not**: 却下。1 本の grep backstop を追加して穴を塞ぐ

### A6: domain で runtime kind（local / managed）を直接 switch する

- **Pros**: predicate なしで scope-check に分岐を書ける
- **Cons**: domain が adapter 具象を知ることになり B-1（domain → adapter 非依存）/ DSM 違反。将来 runtime が増えるたびに domain を修正する維持地獄
- **Why not**: 却下

### A7: 新 resolution 値 `unverifiable` を追加する

- **Pros**: 出自が resolution 型で自明になる
- **Cons**: `FindingResolution` union を壊し、decision-ledger key / escalation 導出 / issue 描画 / options 契約を作り直す並行機構新設になる。#689 の A3 却下と同じ理由
- **Why not**: 却下。`origin:"scope"` + 別文言で十分

## Consequences

### Positive

- managed 上で `permissionScope` を宣言した profile が「評価できなかった」を「スコープ内だった」と報告する構造的 fail-open の穴が塞がれる
- scope-check の安全方向（fail-closed）と reviewer activation の安全方向（fail-safe）が同一 seam の `string[]` 契約に干渉せず両立できる
- `RealRuntimeStrategy` により将来の実 runtime が predicate 実装を忘れるとコンパイル時に落ちる。grep backstop が型レベル bypass を封じる
- 既存 test fake は完全に無改変（optional predicate、≈10 ファイルで TS2741 なし）
- UNKNOWN finding は decision-ledger に乗るため、人間が一度 `/resume` で決めれば再 escalation しない
- `permissionScope` 未宣言 profile（`standard` / `design-only`）の挙動は完全無変更

### Negative / Known Debt

- local の git エラー由来 `[]`（状態 (b)）は依然 fail-open のまま。`listChangedFiles` の戻り値契約変更を伴う精密化は既知 debt として別変更に委ねる
- optional predicate は absent をフォールスルー（評価可能扱い）に畳むため、predicate を実装しない fake は fail-closed の対象外。意図的設計（fake 非干渉を守るための trade-off）
- managed では UNKNOWN finding の `file` anchor を `verifyFindingRefs` が「存在しない ref」と判定し得る（managed は `getRawFile`、branch null なら全 ref non-existent 扱い）。executor が verdict を `escalation` に倒す既存経路（`executor.ts:726-728`）により望む出口（`awaiting-resume`）は変わらない。#689 の同型 anchor リスクと同じ扱い
- 型レベル pin は「新クラスが `implements RealRuntimeStrategy` と書く」前提で、grep backstop が bypass を封じる。新しい `src/core/runtime/` 配下のクラスは必ず `implements RealRuntimeStrategy` を宣言する慣習を守る必要がある

## References

- Request: `specrunner/changes/scope-unevaluable-fail-closed/request.md`
- Design: `specrunner/changes/scope-unevaluable-fail-closed/design.md`
- Spec: `specrunner/changes/scope-unevaluable-fail-closed/spec.md`
