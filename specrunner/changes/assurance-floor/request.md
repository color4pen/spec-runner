# assurance を構造化し、archive 時に minimumAssurance floor を out-of-loop で強制する（R2 spine）

## Meta

- **type**: spec-change
- **slug**: assurance-floor
- **base-branch**: main
- **adr**: false

<!-- 構造判断は ADR-20260716 D5（protected paths / security に minimumAssurance floor、out-of-loop authority で branch-borne 評価、floor 未満は fail-closed）で ratify 済み。本 request はその spine を、changed-files が揃い out-of-loop で動く唯一の既存地点＝archive 時の protected-paths gate に載せる。profile 選択機構（config/request→非 standard profile）は R6/fast、本 request の射程外。標準 profile は最強 assurance で floor を自明に満たす。 -->

## 背景

R1 で profile が branch-borne immutable に載ったが、`assurance` は opaque（`Readonly<Record<string,unknown>>`）で floor が見るフィールドが無い。ADR D5 の floor（protected path 変更には高い保証を課す）を成立させるには (a) assurance に比較可能な typed フィールドを与え、(b) floor をどこで out-of-loop に評価するかを決める必要がある。

調査で判明した構造的制約:
- **floor のトリガ（protected path を touch）は changed-files が無いと判定できず、changed-files は実装後（PR）にしか出ない**。着手前 / attach 前には判定材料が無い。
- **既存の protected-paths 評価（`evaluateProtectedPaths`）は archive `--with-merge` の merge gate（`src/core/archive/merge-then-archive.ts`）でのみ動き、PR の changed-files に対して out-of-loop（archive は main セッションから起動）で fail-closed escalation する**。

→ floor は changed-files が揃い out-of-loop で動くこの archive gate に載せるのが、現モデルで唯一整合する。本 request は floor をそこに足す spine で、profile 選択（floor を下回る profile を生む機構）は R6 に委ねる。

## 現状コードの前提

- **profile / assurance**: `EffectiveProfile.assurance: ProfileAssurance = Readonly<Record<string,unknown>>`（`src/state/schema/types.ts`）。`STANDARD_PROFILE`（`src/state/profile.ts`）の assurance は現状 `{}`。`computePolicyDigest` が assurance を含めて hash（`src/state/profile.ts`）。`getProfile(state)` = absent→STANDARD。
- **digest 後方互換**: verify-checkpoint の digest 検証は「stored profile の自己整合」（`computePolicyDigest(profile)===profile.policyDigest`）。assurance を構造化しても、各 profile は自身の assurance に対して自己整合なので、R1 で作られた `assurance:{}` の checkpoint も attach を通る（STANDARD 定数が変わるだけで既存 profile の自己整合は不変）。
- **archive protected-paths gate**: `src/core/archive/merge-then-archive.ts`（protected-paths 評価 → `formatEscalation` → merge 停止 `exitCode 1`）。config は `ArchiveConfig.protectedPaths?: string[]`（`src/config/schema/types.ts`）。`evaluateProtectedPaths`（`src/core/archive/protected-paths.ts`）は PR changed-files に glob マッチ、truncated は fail-closed。
- **archive は out-of-loop**: `src/cli/archive.ts` が main セッション（rebase-finish 前提）で `loadConfig(repoRoot)` を読む。worktree 内 config でなく main の config = agent 書換え不可面。
- **job の profile 取得**: archive は job state を解決できる（slug/branch から）。その `getProfile(state)` で effective assurance を得られる。
- **fail-closed 前例**: 既存 protected-paths の `formatEscalation` + `exitCode 1`。

## 要件

1. **assurance の構造化**: `ProfileAssurance` に floor 比較可能な typed フィールドを与える。最小: `{ testDerivation: "frozen" | "coupled"; biteEvidence: "required" | "optional"; specReview: "required" | "omitted" }`。各フィールドに順序（lattice）を定義し、`satisfiesFloor(assurance, floor): boolean` を提供する。`STANDARD_PROFILE.assurance` は最強値（`testDerivation:"frozen", biteEvidence:"required", specReview:"required"`）にし、policyDigest は自己整合を保つ（module load 時再計算）。R1 で作られた `assurance:{}` の既存 checkpoint は自己整合が保たれ attach を通る（後方互換）。

2. **minimumAssurance floor の config**: `ArchiveConfig` に `minimumAssurance?: { protectedPaths: string[]; testDerivation?: ...; biteEvidence?: ...; specReview?: ... }` を足す（`protectedPaths` の既存 glob validation を再利用）。floor は「これらの path を touch する変更に要求する assurance 下限」。

3. **archive gate での floor 強制（out-of-loop, fail-closed）**: `merge-then-archive.ts` の protected-paths 評価の隣で、PR の changed-files が `minimumAssurance.protectedPaths` にマッチし、かつ job の effective profile assurance が floor を **下回る** 場合、merge を fail-closed で停止する（既存 protected-paths と同じ escalation 形、`exitCode 1`）。floor 未満でも protected path を touch しなければ通す。standard（最強 assurance）は常に floor を満たすので素通り。config に `minimumAssurance` が無ければ何もしない（後方互換）。

4. **強制昇格はしない**: profile は immutable（型で保証）。floor 未満は reject（fail-closed）に倒す（ADR D5 の「強制昇格 or fail-closed」のうち後者）。

## スコープ外

- **profile 選択機構**（config/request → 非 standard profile を生む）: R6/fast。本 request は standard のみを扱い、sub-floor profile は**テストの synthetic fixture でのみ**登場させる。
- **job-start / attach 時の floor 評価**: changed-files が無く out-of-loop config 源も別途要るため。archive 時のみ（changed-files + out-of-loop が揃う唯一点）。
- **R6** fast、**R5** provenance/verify。
- protected path の touch 判定を着手前に行うこと（changed-files が無いので不可）。

## 受け入れ基準

- [ ] `ProfileAssurance` が typed フィールド（testDerivation/biteEvidence/specReview）を持ち、`satisfiesFloor` の lattice 比較が正しいことをテストで固定する。
- [ ] `STANDARD_PROFILE.assurance` が最強値で、`STANDARD_PROFILE.policyDigest === computePolicyDigest(STANDARD_PROFILE)`（自己整合）。
- [ ] R1 形式（`assurance:{}`）の profile を持つ checkpoint が verify-checkpoint の digest 検証を通る（後方互換、無変更 green）。
- [ ] archive gate: synthetic な sub-floor profile を持つ job の PR が `minimumAssurance.protectedPaths` を touch する場合、merge が fail-closed で停止することをテストで固定する（歯）。
- [ ] standard profile の job は protected path を touch しても floor を満たし merge が通ることを固定する。
- [ ] protected path を touch しない変更は floor 未満でも通ることを固定する。
- [ ] `minimumAssurance` 未設定の config では gate が何もしない（既存 archive 挙動保存）。
- [ ] 既存の protected-paths / archive / verify-checkpoint テストが無変更で green。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

- **floor は changed-files が揃い out-of-loop で動く archive gate に載せる**。→ 却下: 着手前 / attach 時に評価（changed-files が無く、job-start config は worktree=agent 書換え面）。
- **floor 未満は fail-closed reject**。→ 却下: 実行途中の強制昇格（profile は immutable、型が禁じる）。
- **assurance 構造化は各 profile 自己整合を保ち後方互換**。→ 却下: schemaVersion を上げて既存 checkpoint の attach を壊す。
- **本 request は floor 機構のみ、profile 選択は R6**。→ 却下: config/request→profile 解決を前倒し（R6 の射程を侵食）。sub-floor profile はテスト fixture でのみ使う。
