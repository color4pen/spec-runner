# Design: assurance の構造化と archive 時 minimumAssurance floor の out-of-loop 強制

## Context

`EffectiveProfile.assurance`（`src/state/schema/types.ts:275`）は現状 `Readonly<Record<string, unknown>>` で opaque であり、`STANDARD_PROFILE.assurance`（`src/state/profile.ts:45`）は `{}`。ADR-20260716 D5 は「protected path / security 変更に `minimumAssurance` floor を課し、main-checkout 側の out-of-loop authority で branch-borne に評価し、floor 未満は強制昇格または fail-closed」と定めるが、assurance に比較可能な typed フィールドが無く、floor を評価する地点も未確定である。

構造的制約が floor の設置点を一意に決める:

- floor のトリガ（protected path を touch したか）は **changed-files** が無いと判定できない。changed-files は実装後（PR）にしか存在しない。着手前 / attach 前には判定材料が無い。
- 既存の protected-paths 評価（`evaluateProtectedPaths`、`src/core/archive/protected-paths.ts`）は archive `--with-merge` の merge gate（`src/core/archive/merge-then-archive.ts` Step 3.5, L262-321）でのみ動作する。archive は main セッションから起動され（`src/cli/archive.ts` が `loadConfig()` で main の config を読む、L151-175）、PR の changed-files に対して out-of-loop で fail-closed escalation する。

→ changed-files が揃い、out-of-loop config 源で動く唯一の既存地点が archive gate である。floor はここに載せるのが現モデルで唯一整合する。

digest 後方互換の前提: verify-checkpoint（`src/core/attach/verify-checkpoint.ts:150-169`）は「stored profile の自己整合」（`computePolicyDigest(state.profile) === state.profile.policyDigest`）のみを検証し、`STANDARD_PROFILE` との一致は見ない。したがって assurance の定数値を変えても、R1 で記録済みの `assurance: {}` を持つ checkpoint は自身の body に対して自己整合を保ち、attach を通過する。

型互換の前提: 既存テストは `assurance: {}` および `assurance: { level: "high" }` という **object literal** を `EffectiveProfile` / `computePolicyDigest` の引数として使う（`tests/unit/state/profile.test.ts:70,114`、`tests/attach/verify-checkpoint.test.ts:472,491,511`）。`ProfileAssurance` を必須フィールドの厳格 interface にすると excess-property-check / 欠落フィールドで typecheck が壊れ、「既存テスト無変更 green」を満たせない。したがって構造化は **index signature を保持したまま** typed な optional フィールドを足す widening として行う。

## Goals / Non-Goals

**Goals**:

- `ProfileAssurance` に floor 比較可能な typed フィールド（`testDerivation` / `biteEvidence` / `specReview`）を与え、各フィールドに lattice 順序を定義し、`satisfiesFloor(assurance, floor): boolean` を提供する。
- `STANDARD_PROFILE.assurance` を最強値にし、`policyDigest` の自己整合を module load 時再計算で保つ。
- `ArchiveConfig` に `minimumAssurance` を足し、archive gate で PR の changed-files が floor の protected path を touch し、かつ job の effective profile assurance が floor を下回るとき、merge を fail-closed で停止する。
- 既存の attach / archive / protected-paths / verify-checkpoint 挙動とテストを無変更のまま保つ（後方互換）。

**Non-Goals**:

- profile 選択機構（config / request → 非 standard profile を生む解決）: R6/fast。本 change は standard profile のみを実運用で扱い、sub-floor profile は**テストの synthetic fixture でのみ**登場させる。
- job-start / attach 時の floor 評価: changed-files が無く、job-start config 源は worktree（agent 書換え面）であるため対象外。archive 時のみ。
- 強制昇格（実行途中で profile を上げる）: profile は immutable で型が禁じる。floor 未満は reject（fail-closed）一択。
- provenance / verify（R5）、fast の工程構成（R6）。

## Decisions

### D1: `ProfileAssurance` を index signature 保持の widening で構造化する

`ProfileAssurance` を次の形に変える（`src/state/schema/types.ts`）:

- `testDerivation?: "coupled" | "frozen"`
- `biteEvidence?: "optional" | "required"`
- `specReview?: "omitted" | "required"`
- `[key: string]: unknown`（後方互換の index signature を残す）

各フィールドは **optional** かつ index signature を残す。

**Rationale: why optional + index signature, not required fields**:
既存テストが `assurance: {}` と `assurance: { level: "high" }` の object literal を渡す。必須フィールドにすると `{}` は欠落エラー、`{ level: "high" }` は excess-property エラーで typecheck が壊れる。index signature を残せば両 literal が assignable のまま typed 名前付きフィールドを読める。これは「opaque record → typed record」の strict widening であり、既存の記録値・literal を一切壊さない。

**Alternatives considered**:
- 必須フィールドの厳格 interface → 既存テストの literal が typecheck 不能。却下。
- `ProfileAssurance` は opaque のまま別途 `StructuredAssurance` 型を定義 → 「`ProfileAssurance` に typed フィールドを与える」という要件に反し、floor が opaque フィールドを読むことになる。却下。
- `schemaVersion` を上げて厳格型へ移行 → 既存 checkpoint の attach を壊す（D3 と ADR D6 に反する）。却下。

### D2: lattice と `satisfiesFloor` を pure function として `src/state/profile.ts` に置く

各フィールドに全順序（rank）を定義する:

- `testDerivation`: `coupled` < `frozen`
- `biteEvidence`: `optional` < `required`
- `specReview`: `omitted` < `required`

`AssuranceFloor`（`{ testDerivation?; biteEvidence?; specReview? }`、全フィールド optional）と `satisfiesFloor(assurance: ProfileAssurance, floor: AssuranceFloor): boolean` を定義する。判定:

- floor が constrain しないフィールド（`undefined`）はスキップ。
- floor が constrain するフィールドについて、assurance 側の値が **欠落 / 未知値** なら `false`（fail-closed）。
- assurance 側の rank が floor の rank 未満なら `false`。
- 上記いずれにも該当しなければ `true`。

**Rationale: why fail-closed on absent/unknown**:
既存の protected-paths が truncated（不完全データ）を fail-closed に倒すのと同じ姿勢。assurance フィールドが読めない = 保証水準が証明できない → floor 未満とみなすのが安全側。ADR D5 の fail-closed 方針に一致する。

**配置の Rationale: why `profile.ts`**:
`profile.ts` は「no I/O、pure functions」を明示する既存モジュール（`computePolicyDigest` / `getProfile` の隣）。lattice 比較は純関数であり同居が自然。config 型（`MinimumAssuranceConfig`）は config レイヤに置き、`AssuranceFloor` を extends する。

**Alternatives considered**:
- 欠落フィールドを「最強とみなす」fail-open → 未知の保証を安全と誤認する授権バイパス。却下。
- lattice を config レイヤに置く → state（profile）が config に依存する逆転。却下。

### D3: STANDARD_PROFILE の assurance を最強値にし、digest は load 時再計算で自己整合を保つ

`_standardBody.assurance`（`src/state/profile.ts:45`）を `{ testDerivation: "frozen", biteEvidence: "required", specReview: "required" }` にする。`STANDARD_PROFILE.policyDigest` は現状どおり `computePolicyDigest(_standardBody)` を module load 時に計算するため、定数変更後も自己整合が自動的に保たれる。

**Rationale**:
standard は最強 assurance なので、いかなる floor も自明に満たし archive gate を素通りする（実運用の全 job が standard の R2 時点で floor が誤って人を止めない）。verify-checkpoint は stored profile の自己整合のみを見るため、STANDARD 定数の変化は R1 で記録済みの `assurance: {}` checkpoint の自己整合に影響しない（後方互換）。

**Alternatives considered**:
- STANDARD の assurance を中間値にする → floor 設定次第で standard job が止まり得る。standard は最強であるべき（ADR: standard も明示 profile の一つで最強保証）。却下。

### D4: archive gate に floor を Step 3.6 として独立ブロックで足す（fail-closed, out-of-loop）

`runMergeThenArchive`（`src/core/archive/merge-then-archive.ts`）の Step 3.5（protected-paths）直後に Step 3.6 を足す:

1. `input.minimumAssurance` 不在、または `minimumAssurance.protectedPaths` が空 → 何もしない（後方互換）。
2. PR の changed-files を取得（floor 専用の `listPullRequestFiles` 呼び出し。取得失敗は Step 3.5 と同型の fail-closed escalation）。
3. `evaluateProtectedPaths({ changedFiles, truncated, patterns: minimumAssurance.protectedPaths })` を再利用して「floor protected path を touch したか」を判定する。
   - `truncated` → fail-closed escalation（floor 変種、`exitCode 1`）。
   - match 無し → floor 非該当 → **通す**。
   - match 有り → 効果的 assurance を評価。
4. job の effective assurance（Step 1 で load した `state` から `getProfile(state).assurance`）と floor を `satisfiesFloor` で比較。満たす → 通す。満たさない → fail-closed escalation（`formatEscalation` + `exitCode 1`、既存 protected-paths と同型）。

effective assurance は Step 1（`src/core/archive/merge-then-archive.ts:153-186`）で解決済みの `state` から取得するため、outer スコープに `let` で捕捉して Step 3.6 に渡す。

**Rationale: why an independent block with its own fetch, not sharing Step 3.5's fetch**:
「既存 protected-paths テストが無変更 green」を最優先し、Step 3.5 を byte 単位で不変に保つ。floor は opt-in（`minimumAssurance` 設定時のみ）なので、追加の `listPullRequestFiles` 呼び出しは floor 有効時のみ発生し、out-of-loop で許容範囲。`evaluateProtectedPaths` を「touch 判定」に再利用することで truncated の fail-closed も既存ロジックで担保する。

**Rationale: why Step 3.5 と floor は独立ゲートで順序非依存**:
両者は別々の protected path 集合（`archive.protectedPaths` と `minimumAssurance.protectedPaths`）に対する別々の fail-closed 判定。どちらも通過して初めて merge へ進む。

**Alternatives considered**:
- changed-files を 1 回だけ取得して両ゲートで共有する最適化 → Step 3.5 の内部 fetch を移動する必要があり、既存テストの呼び出し回数・escalation 経路に触れるリスク。opt-in の追加 fetch は安価なので不採用（将来の最適化として残す）。却下。
- floor 未満で強制昇格 → profile は immutable、型が禁じる（ADR D5 の後者を採る）。却下。

### D5: `minimumAssurance` config を `ArchiveConfig` に足し、既存の glob validation を再利用する

`ArchiveConfig`（`src/config/schema/types.ts:308`）に足す:

```
minimumAssurance?: {
  protectedPaths: string[];              // floor が適用される path の glob
  testDerivation?: "coupled" | "frozen";
  biteEvidence?: "optional" | "required";
  specReview?: "omitted" | "required";
}
```

`MinimumAssuranceConfig` 型として `AssuranceFloor & { protectedPaths: string[] }` の形で export する。validation（`src/config/schema/validation.ts:346-375`）の `archive` object schema に、既存 `protectedPaths` と同じ非空 string 配列 glob 検証を再利用し、各 level フィールドは `union([literal(...), literal(...)])`（`zod/v4-mini`、既に import 済み）で検証する。CLI（`src/cli/archive.ts:151-175`）は `config.archive?.minimumAssurance` を読み、`runMergeThenArchive` に渡す（`protectedPaths` の既存パターンと並列）。

**Rationale**:
floor の「path 集合」は既存 protected-paths と同じ glob 意味論。schema を再利用することで挙動と検証の一貫性を保つ。config 不在時は `undefined` → gate 無効（後方互換）。

**Alternatives considered**:
- `minimumAssurance` を top-level config に置く → floor は archive gate 固有の関心事。`ArchiveConfig` 配下が凝集する。却下。

## Risks / Trade-offs

- **[Risk] `ProfileAssurance` の index signature 保持で「typed」が骨抜きになる（任意キーが素通り）** → Mitigation: floor が読むのは名前付き typed フィールドのみ。`satisfiesFloor` は未知値 / 欠落を fail-closed に倒すため、index signature 由来の任意キーは floor 判定を緩めない。index signature は後方互換のためだけに存在し、floor の強度に影響しない。

- **[Risk] R1 で in-flight（`assurance: {}`）の job が、floor 設定下で archive されると protected path touch 時に blocked になる** → Mitigation: これは意図的な fail-closed 挙動。`assurance: {}` は保証水準を証明できない値なので、floor が有効なら人手レビューへ倒すのが安全側。かつ floor は opt-in（`minimumAssurance` 未設定なら影響ゼロ）。design と escalation メッセージでこの挙動を明示する。

- **[Risk] floor gate 追加で `listPullRequestFiles` が二重に呼ばれる（両ゲート有効時）** → Mitigation: floor は opt-in。out-of-loop の archive で追加 1 回の API 呼び出しは許容範囲。共有 fetch は将来の最適化として残す。

- **[Risk] STANDARD_PROFILE.policyDigest の値が変わり、digest をハードコードした fixture が壊れる** → Mitigation: 既存 fixture / テストは `computePolicyDigest` を動的に呼ぶか、`assurance: {}` の自己整合 body を使うため、STANDARD 定数の digest には依存しない（調査で確認済み）。新規テストも動的計算を使う。

## Open Questions

なし（設計分岐は ADR-20260716 D5 と request の architect 評価済み判断で ratify 済み）。
