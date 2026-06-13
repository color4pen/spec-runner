# Tasks: scope 評価不能 runtime の fail-closed escalation

> 既定挙動完全一致が最重要。各タスクは additive・後方互換で、`permissionScope` 未宣言・predicate `true`/absent では #689（main = `d2f6b6245`）と完全一致すること。fail-closed が発火するのは「scope 宣言あり ＋ checkpoint ＋ predicate=`false`」の交差のみ。

## T-01: RuntimeStrategy に optional 評価可能性 predicate を追加（port・additive）

- [ ] `src/core/port/runtime-strategy.ts` の `RuntimeStrategy` interface に optional method `canDeriveChangedFiles?(): boolean` を追加する。JSDoc に以下を明記する: 「changed-files を機械導出できる runtime かを表す seam メタ情報」「absent → `listChangedFiles` 経路へフォールスルー（＝現行挙動、fail-closed scope 評価は発火しない）」「`true`=導出可能 / `false`=導出不能」「scope-check が fail-closed に使う」「reviewer activation 消費者は参照せず fail-safe を維持する」「`listChangedFiles` の戻り値型・契約には影響しない」。
- [ ] 同ファイルに必須版の型エイリアスを追加・export する: `export type RealRuntimeStrategy = RuntimeStrategy & { canDeriveChangedFiles(): boolean };`。JSDoc に「`src/core/runtime/` の具象 runtime はこれを implements し、predicate 実装漏れをコンパイル時に検出する」を明記。
- [ ] `listChangedFiles` の JSDoc・シグネチャ（`Promise<string[]>`、Never throws、`[]` on error）は **変更しない**。

**Acceptance Criteria**:
- `RuntimeStrategy` に optional な `canDeriveChangedFiles?(): boolean` が additive に存在する。
- `RealRuntimeStrategy` が export され、`RuntimeStrategy` ＋ 必須 predicate の交差型である。
- `listChangedFiles` の型・契約が無変更（diff で確認）。
- `bun run typecheck` が green（既存 fake は無改変で通る）。

## T-02: 実 runtime に predicate を実装し、型レベルで mechanical 固定

- [ ] `src/core/runtime/local.ts` の `LocalRuntime` を `implements RuntimeStrategy` から `implements RealRuntimeStrategy` に変更し、`canDeriveChangedFiles(): boolean { return true; }` を実装する（local は worktree があり `git diff` を導出できる）。
- [ ] `src/core/runtime/managed.ts` の `ManagedRuntime` を `implements RealRuntimeStrategy` に変更し、`canDeriveChangedFiles(): boolean { return false; }` を実装する（managed は worktree が無く構造的に導出不能。`listChangedFiles` が常に `[]` を返すのと整合）。
- [ ] 両クラスの `runtimeStrategy: this`（`local.ts:565` / `managed.ts:292`）が field 型 `runtimeStrategy?: RuntimeStrategy`（`src/core/types.ts:91`）への部分型代入として引き続き通ることを確認する（`RealRuntimeStrategy` は `RuntimeStrategy` の部分型なので無改変で通る）。
- [ ] import 追加（`RealRuntimeStrategy`）は port から行い、新たな逆向き edge（B-1/DSM 違反）を作らないこと。

**Acceptance Criteria**:
- `LocalRuntime.canDeriveChangedFiles()` が `true`、`ManagedRuntime.canDeriveChangedFiles()` が `false` を返す（unit test。`tests/unit/runtime/list-changed-files.test.ts` に追加するか同階層に新規 test）。
- 両具象クラスが `RealRuntimeStrategy` を implements しており、predicate を削ると `bun run typecheck` が落ちる（実装漏れがコンパイル時に検出される — 型 pin の動作確認）。
- `bun run typecheck` が green。

## T-03: bare implements の不在を arch test で固定（型 pin の bypass 封じ backstop）

- [ ] `tests/unit/architecture/core-invariants.test.ts` に、既存の grep ヘルパ（`grepE` / `parseGrepOutput` / `violationLines` 等）と同型のアサーションを 1 本足す: `src/core/runtime/` 配下に bare `implements RuntimeStrategy`（`RealRuntimeStrategy` ではない形）の call-site が存在しないことを検証する。
- [ ] grep パターンは `implements RealRuntimeStrategy` を誤検出しないこと（例: `implements RuntimeStrategy` 直後が単語境界で、`RealRuntimeStrategy` を含む行を拾わない正規表現にする）。コメント行は既存 `isComment` 系フィルタで除外する。
- [ ] このアサーションは method 単位の grep ではなく「bare implements の不在」のみを見るため、`RuntimeStrategy` に将来 method が増えても維持コストが増えないこと（コメントで意図を明記）。`tests/` 配下の fake は scan 対象外であることを確認する。

**Acceptance Criteria**:
- `src/core/runtime/` の具象 runtime が bare `implements RuntimeStrategy` を使っていないことが arch test で固定され green になる（型 pin の bypass を封じる）。
- B-1〜B-10 ＋ DSM closure が green。

## T-04: UNKNOWN finding を合成する純関数を scope.ts に追加

- [ ] `src/core/pipeline/scope.ts`（fs / child_process を import しない純モジュール）に `synthesizeScopeUnverifiableFinding(ctx: SynthesisContext): Finding[]` を追加する。`SynthesisContext`（既存 `{ slug }`）を再利用する。
- [ ] 合成する finding（通常 1 件）は決定的に: `origin: "scope"`、`resolution: "decision-needed"`、`severity: "high"`、`file` = 当該 change の `request.md` 相対パス（`specrunner/changes/${ctx.slug}/request.md` — breach 合成と同じ anchor 算出、worktree に必ず存在）、`title` = breach 合成（`Scope exceeded: ...`）とは **別の固定文言**（「scope を検証できなかった（UNKNOWN）」旨）、`rationale` = 「この runtime では changed-files を導出できないため宣言された permissionScope を検証できなかった。スコープ内とも超過とも確定していない（UNKNOWN）」旨の決定的固定文。
- [ ] `options` = 決定的 3 択（各 `label` + `consequence`）: (1) changed-files を導出できる runtime（例: local）で実行し直す、(2) この profile の permissionScope 宣言を外す（以降 scope 検証は走らない）、(3) scope 検証なしで進めることを受け入れる（リスク受容で前進）。
- [ ] 既存の `synthesizeScopeFindings`（breach 合成）は **変更しない**。新関数は別文言・別 options で、`computeFindingKey` が breach finding と衝突しないこと。

**Acceptance Criteria**:
- `synthesizeScopeUnverifiableFinding`: 同一 `ctx` で `file` / `title` / `rationale` / `options`（≥2）が完全一致する決定性を持つ（unit test）。
- 合成 finding の `resolution` は `decision-needed`、`origin` は `"scope"`、`severity` は `"high"`（unit test）。
- 同一 slug の UNKNOWN finding と breach finding の `computeFindingKey` が異なる（unit test）。
- `bun run typecheck` が green。

## T-05: scope-check に fail-closed 分岐を配線

- [ ] `src/core/step/scope-check.ts` の `computeExtraScopeFindings` で、既存 early guard（`permissionScope` 不在 / `stepName !== checkpoint` / `runtimeStrategy` 不在で `[]`）の **直後・`listChangedFiles` を呼ぶ前** に分岐を足す: `deps.runtimeStrategy.canDeriveChangedFiles?.() === false` のとき `listChangedFiles` を呼ばず `synthesizeScopeUnverifiableFinding({ slug: deps.slug })` を返す。
- [ ] predicate が `true` または absent（`?.()` が `undefined`）のときは `=== false` が偽となり、現行経路（`listChangedFiles` → `deriveScopeBreach` → `synthesizeScopeFindings`）へフォールスルーする（#689 と完全一致、既存コードは無改変）。
- [ ] `scope-check.ts` の import / 純粋性（fs / child_process を import しない）を維持する。新関数 import は `../pipeline/scope.js` から。

**Acceptance Criteria**:
- predicate=`false` のとき `listChangedFiles` が **呼ばれず**、UNKNOWN な `decision-needed`（`origin:"scope"`）が返る（test。fake は `canDeriveChangedFiles: () => false` を明示設定し、`listChangedFiles` spy が未呼び出しであることを assert）。
- predicate=`true` または absent のとき、`computeExtraScopeFindings` の戻り値が #689 と完全一致する（test）。
- `bun run typecheck` が green。

## T-06: fail-closed escalation の統合テスト（評価不能 → awaiting-resume）

- [ ] `permissionScope` を渡した `StepExecutor` を、checkpoint step ＋ `canDeriveChangedFiles: () => false` の fake runtime で実行すると、verdict が `escalation` になり job が `awaiting-resume` に遷移し `resumePoint.step` が checkpoint になることを test で固定する（`tests/unit/core/step/scope-escalation.test.ts` に追加、新規 fake は `canDeriveChangedFiles: () => false` を明示）。
- [ ] 合成 UNKNOWN finding が `getOpenDecisionFindings`（`resumePoint.step = checkpoint`）で拾えること、`buildEscalationComment` で title・rationale・options が「Decisions needed」に描画されることを test で固定する（issue-notifier 本体は無改変）。
- [ ] 解決済み再 escalate 抑止: UNKNOWN finding と一致する key の `DecisionRecord`（`step = checkpoint`）が state にあるとき、同一条件から再合成しても `filterUndecidedFindings` で除外され verdict が `escalation` にならないことを test で固定する。

**Acceptance Criteria**:
- 評価不能 ＋ scope 宣言 ＋ checkpoint で `awaiting-resume` に落ち、UNKNOWN finding が escalation コメントに描画される（test）。
- 解決済み UNKNOWN は再 escalate しない（test）。
- `computeFindingKey` / decision-ledger / issue-notifier は無変更。

## T-07: 評価可能経路の #689 parity・activation 不変・既定挙動の検証

- [ ] predicate=`true` の fake で、breach あり → `escalation` / breach なし → `approved` が #689 と一致することを test で固定する（既存 `scope-escalation.test.ts` の breach 系シナリオを predicate=`true` fake で再確認、または fake に `canDeriveChangedFiles: () => true` を加えて等価性を確認）。
- [ ] predicate 未実装（absent）の fake で、scope 宣言 checkpoint が `listChangedFiles` 経路で breach 判定され #689 と一致することを test で固定する（既存 `scope-escalation.test.ts` の fake は `canDeriveChangedFiles` 未実装 ＝ absent なので、無変更で green であることを確認）。
- [ ] reviewer activation（`executor.ts:204`）の挙動・テスト（`executor-activation.test.ts` 等）が無変更で green であることを確認する（predicate を参照しない）。
- [ ] `FindingResolution` の妥当値集合が `fixable` / `decision-needed` の 2 値のままであることを既存 test（`VALID_RESOLUTIONS` 検証）で確認する（新 resolution 値を足さない）。
- [ ] `permissionScope` 未宣言 profile で scope-check が early guard で `[]` を返し、`PIPELINE_REGISTRY` が無改変であることを確認する（既存テストが無変更で green）。

**Acceptance Criteria**:
- 評価可能（`true`/absent）のときは #689 と完全一致（breach あり→escalation / breach なし→通過）（test）。
- activation テスト・既存 `scope-escalation.test.ts`・decision-ledger テストが無変更で green。
- `FindingResolution` union が `fixable` / `decision-needed` のまま（test）。

## T-08: 全体検証（既定挙動完全一致と arch 不変条件の最終確認）

- [ ] `bun run typecheck` が green。
- [ ] `bun run test` が green（既存テストは無変更、または additive 拡張のみで green）。
- [ ] `bun run lint`（`--max-warnings 0`）が green（未使用引数は `^_` prefix で吸収）。
- [ ] arch 不変条件 B-1〜B-10 ＋ DSM closure が green（新純関数 `synthesizeScopeUnverifiableFinding` は domain＝`core/pipeline/`、predicate は port、bare implements 不在の backstop が green）。
- [ ] scope 宣言 profile が registry に無いため fail-closed が一切発火し得ず、既定挙動が完全一致であることを確認する。

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green。
- arch 不変条件（B-1〜B-10 ＋ DSM closure ＋ bare implements 不在）が green。
- 既定挙動完全一致（scope 未宣言・predicate `true`/absent で #689 と一致）が test で担保されている。
