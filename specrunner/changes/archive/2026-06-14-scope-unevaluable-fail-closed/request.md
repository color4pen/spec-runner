# scope を評価できない runtime では breach を黙って通さず escalation する（fail-closed）— RuntimeStrategy に評価可能性 predicate を追加

## Meta

- **type**: spec-change
- **slug**: scope-unevaluable-fail-closed
- **base-branch**: main
- **adr**: true

## 背景

scope-exceeded-escalation（PR #689）で入れたスコープ超過の機械導出は、`RuntimeStrategy.listChangedFiles` の changed-files を歯（`deriveScopeBreach`）に通して breach を判定する。しかしこの seam の `[]` は **3 状態を畳んでいる**ため、scope の用途では fail-open になる。本 request はそれを fail-closed に倒す土台ハードニング。**本 request は #689 の機構の上に乗る**（#689 は main にマージ済み = `d2f6b6245`）。

### 何が問題か（検証済み）

- `listChangedFiles` の契約は「**Never throws、あらゆるエラーで `[]` を返す**」（`src/core/port/runtime-strategy.ts:380` の JSDoc）。
- `[]` が表す状態は実際には 3 つ: (a) 評価済みで変更なし、(b) git エラー（local の catch → `[]`、`src/core/runtime/local.ts`）、(c) 評価不能（managed は worktree が無く常に `[]`、`src/core/runtime/managed.ts` の docstring「custom reviewer activation not supported」）。
- この seam には**安全方向が正反対の 2 消費者**がいる:
  - 消費者1 = reviewer activation（`src/core/step/executor.ts:204`）。`[]` → パス条件マッチせず → reviewer を**過少起動**。skip は保守的なので fail-safe。
  - 消費者2 = scope-check（`computeExtraScopeFindings`、`src/core/step/scope-check.ts`）。`[]` → `deriveScopeBreach` が `breached:false` → **スコープ内として全通し**。これは fail-open。
- とくに **managed では `listChangedFiles` が構造的に常に `[]`**（(c)）なので、managed 上で `permissionScope` を宣言した profile は「評価できなかった」を「スコープ内だった」と報告する。これは scope 機構の存在意義（責務を越えたら黙って通さない）と「記録は正直」原則の両方に反する。

### 設計原理との整合

「記録は正直」を seam に適用すると、scope の用途では「**評価できなかった**」を「**スコープ内だった**」に畳んではいけない。評価不能は UNKNOWN として顕在化させ、escalation に倒す（fail-closed）。activation の用途は従来どおり fail-safe（`[]` → 過少起動）でよく、両者の契約は分けて満たす。

### 現状コードの前提（検証済み）

- `RuntimeStrategy`（`src/core/port/runtime-strategy.ts:143`）に「changed-files を評価できる runtime か」を表す predicate は無い。
- `computeExtraScopeFindings`（`src/core/step/scope-check.ts`）は `permissionScope` absent / step≠checkpoint / `runtimeStrategy` 不在のとき `[]` を返す early guard を持つ。**managed は `runtimeStrategy` を持つ**（`managed.ts:292` で `runtimeStrategy: this`）ため、この guard には掛からず `listChangedFiles → []` → 無 breach に落ちる。
- breach 合成は `synthesizeScopeFindings`（`src/core/pipeline/scope.ts`、純関数）。`origin:"scope"` / `decision-needed` / 決定的 `computeFindingKey` で、`deriveJudgeVerdict`（`src/core/step/judge-verdict.ts`）→ escalation、decision-ledger（`src/core/decision/decision-ledger.ts`）で人間解決済みは再 escalate しない。
- `FindingResolution`（`src/kernel/report-result.ts:15`）は `fixable | decision-needed` の 2 値。`origin?: "scope"` discriminator は #689 で追加済み。

## 要件

最重量の変更を名指しする: **`RuntimeStrategy` に評価可能性 predicate を additive・optional に追加し、scope-check に「scope 宣言あり ＋ 評価不能 → UNKNOWN escalation」の分岐を足す**。activation 消費者と既存 profile の挙動は不変。

1. **`RuntimeStrategy` に評価可能性 predicate を追加（additive・optional）**
   - `src/core/port/runtime-strategy.ts:143` の interface に、changed-files の導出が可能な runtime かを表す **optional** predicate を 1 つ足す（`canDeriveChangedFiles?(): boolean`）。
   - 実装: local → `true`、managed → `false`（両 real runtime は明示実装）。
   - **optional でなければならない理由**: 必須メソッドにすると `: RuntimeStrategy` 型で full object を構成する既存 test fake（≈10 ファイル: 型注釈 `: RuntimeStrategy` / `as RuntimeStrategy` で 9、`listChangedFiles` を持つ full-shape fake で 10）が TS2741 で compile 不能になり、AC「既存テスト無変更で green」と矛盾する。optional なら未実装 fake は無改変で通る。
   - **absent の意味（重要）**: predicate を実装しない runtime は「評価不能」ではなく **#689 の既存経路（`listChangedFiles`）へフォールスルー**＝現行挙動とする。fail-closed 判定が効くのは predicate を明示実装した real runtime（managed=`false`）のみ。
   - **optional の残穴（要件5で塞ぐ）**: 「absent → フォールスルー（＝評価可能扱い）」は test fake を守る反面、将来 `src/core/runtime/` に追加される real runtime が `canDeriveChangedFiles` を実装し忘れると黙って fail-open に戻る穴を作る。#689 の「機械的に導出する歯」思想に倣い、これは arch で機械固定する（要件5）。
   - 既存 `listChangedFiles` の契約・戻り値（`string[]`、Never throws、`[]` on error）は**変更しない**。predicate は seam のメタ情報として直交に足す。

2. **scope-check に fail-closed 分岐を追加**
   - `computeExtraScopeFindings`（`scope-check.ts`）で、`permissionScope` 宣言あり ＋ step==checkpoint ＋ `runtimeStrategy` 在りを満たした後、**`runtimeStrategy.canDeriveChangedFiles?.() === false` のときだけ `listChangedFiles` を呼ばず**、breach とは別の **UNKNOWN な decision-needed finding を合成**して返す。
   - predicate が absent（未実装）または `true` のときは #689 の現行経路（`listChangedFiles` → `deriveScopeBreach` → `synthesizeScopeFindings`）と完全に同一。

3. **UNKNOWN finding は breach finding と区別しつつ同一経路に乗せる**
   - `src/core/pipeline/scope.ts` に純関数を足す（例 `synthesizeScopeUnverifiableFinding(ctx)`）。breach 合成とは title / rationale / options が異なるが、`origin:"scope"` / `resolution:"decision-needed"` / 決定的 `file` anchor（当該 change の `request.md`）/ 固定文言で**決定的**に作る。
   - rationale: 「この runtime では changed-files を導出できないため、宣言された permissionScope を検証できなかった」。
   - options（≥2 契約を満たす決定的 3 択）: 「changed-files を導出できる runtime で実行し直す」/「この profile の permissionScope 宣言を外す」/「scope 検証なしで進めることを受け入れる（リスク受容）」。
   - `computeFindingKey(checkpoint, finding)` が決定的なので、人間が `/resume` で決めた UNKNOWN は decision-ledger により再 escalate しない。

4. **既定挙動・activation 不変**
   - `permissionScope` を宣言する profile が無い限り、scope-check は従来どおり early guard で `[]`。`PIPELINE_REGISTRY` は無改変。
   - reviewer activation（`executor.ts:204`）は `listChangedFiles` の戻り値も契約も変わらないため**完全に無改変**（過少起動の fail-safe を維持）。

5. **real runtime が predicate を実装していることを arch で固定（optional の穴を塞ぐ）**
   - optional ＋「absent→フォールスルー」は test fake を守る代わりに、将来 `src/core/runtime/` に追加される real runtime が `canDeriveChangedFiles` を実装し忘れると黙って fail-open に戻る穴を作る。#689 の「機械的に導出する歯」思想に倣い、これを mechanical に固定する。
   - `src/core/runtime/` で `implements RuntimeStrategy` する具象クラスは全て `canDeriveChangedFiles` を実装していることを、arch test（既存 `core-invariants` の grep と同型）または型アサーションで pin する。test fake（`tests/` 配下）は対象外（optional の利便性を維持）。
   - これにより optional の利便性（fake 非干渉）と fail-closed の堅さ（real runtime の取りこぼし防止）を両立する。
   - **推奨機構（型レベル・design が最終決定）**: 具象は 2 クラスのみで両者 `implements` 句を持つため型で縛れる。`RealRuntimeStrategy = RuntimeStrategy & { canDeriveChangedFiles(): boolean }`（必須版）を定義し、`LocalRuntime` / `ManagedRuntime` を `implements RealRuntimeStrategy` にする。port `RuntimeStrategy` は optional のまま（fake 非干渉）。`runtimeStrategy: this` は field 型 `runtimeStrategy?: RuntimeStrategy`（`src/core/types.ts:91`）への部分型代入で通り、scope-check は従来どおり `RuntimeStrategy` 越しに `canDeriveChangedFiles?.()` を optional 呼び出しする。将来 real runtime が実装を忘れると**コンパイル時に落ちる**ため歯として最強で、grep のメンテも不要。grep arch test / runtime 検査は代替として可だが、型レベルを推す。

## スコープ外

- **local の git エラー由来 `[]`（状態 (b)）の精密化** — 本 request の predicate は runtime-class の評価可能性（managed=不能）のみを扱う。local で `git diff` が非ゼロ終了した場合の `[]` を「変更なし」と区別する精密化は、`listChangedFiles` の戻り値契約変更を伴うため**別 request（既知 debt）**。本土台は構造的・支配的な穴（managed の常時 `[]`）を塞ぐことに集中する。
- **軽量 fast pipeline 本体（新 descriptor ＋ permissionScope 宣言）** — 本ハードニングが入って初めて安全に scope 宣言できる利用者。次の上物 request。
- **managed 用の changed-files seam を新設して managed でも評価可能にする** — 本 request は「評価できないなら fail-closed」であって、managed に diff 能力を与えるものではない。
- **昇格（fast→standard）/ 再分類（fixup→新 request）出口、fixup 再入場** — いずれも別 request。
- **既存 pipeline の挙動変更** — `standard` / `design-only` は scope 未宣言のまま無改変。

## 受け入れ基準

- [ ] `RuntimeStrategy` に **optional** な評価可能性 predicate（`canDeriveChangedFiles?(): boolean`）が additive に追加され、local→`true` / managed→`false`（unit test）
- [ ] predicate 未実装の runtime は `listChangedFiles` 経路へフォールスルー（=#689 挙動）であることが固定されている（test）
- [ ] `src/core/runtime/` の全 `implements RuntimeStrategy` 具象クラスが `canDeriveChangedFiles` を実装していることが mechanical に固定されている（arch test or 型アサーション。`tests/` 配下の fake は対象外）
- [ ] `listChangedFiles` の戻り値型・契約（`string[]`、Never throws、`[]` on error）は無変更（型・既存 test で固定）
- [ ] `permissionScope` 宣言あり ＋ checkpoint ＋ 評価不能（predicate=`false`）のとき、scope-check は `listChangedFiles` を呼ばず UNKNOWN な `decision-needed`（`origin:"scope"`）を合成し、`deriveJudgeVerdict` → `escalation` → `awaiting-resume` に落ちる（test。新規 fake は `canDeriveChangedFiles: () => false` を明示設定する）
- [ ] 評価可能（predicate=`true` or absent）のときは #689 の挙動と完全一致（breach あり→escalation / breach なし→通過）（test）
- [ ] UNKNOWN finding は決定的で、同一 runtime 条件なら同一 `computeFindingKey` を持ち、人間解決済みは再 escalate しない（test）
- [ ] reviewer activation（`executor.ts:204`）の挙動・テストが無変更（`listChangedFiles` の契約を触らないことの裏返し）
- [ ] `FindingResolution` union は `fixable | decision-needed` のまま（新 resolution 値を追加しない）
- [ ] `permissionScope` 未宣言 profile では scope-check が従来どおり early guard で `[]` → 既存テストが無変更で green
- [ ] `bun run typecheck && bun run test` が green
- [ ] arch 不変条件（B-1〜B-10 ＋ DSM）が green（新純関数は domain、predicate は port）

## architect 評価済みの設計判断

- **評価可能性は port の predicate で表す（戻り値契約は触らない）**: 採用案 A。`listChangedFiles` の `string[]` 契約を変えず、直交する predicate（`canDeriveChangedFiles`）を足すだけ。additive で activation 消費者・既存テストに非干渉、#689 の「optional / absent=現行」スタイルと同型。
  - **却下 B（`listChangedFiles` を `{evaluated, files} | {evaluated:false, reason}` の discriminated return に変更）**: local の git エラー (b) まで fail-closed にできて最も honest だが、activation 消費者の契約とテストを巻き込む。支配的な穴は managed の構造的 `[]` (c) であり、それは predicate で捕捉できる。(b) の精密化はスコープ外（別 request）に切る方が「1 request = 1 収束ループ」に合う。
  - **却下 C（scope 専用の changed-files seam method を新設）**: 各消費者に固有契約を与えられて綺麗だが、データ返却 seam の新設は #689 ADR の A5 で却下した「最小依存原則」に反する。predicate（メタ情報）の追加の方が軽い。
- **predicate は optional（必須にしない）**: 必須メソッド化は `: RuntimeStrategy` 型で full object を構成する既存 test fake（≈10 ファイル）を TS2741 で壊し、AC「既存テスト無変更で green」と矛盾する。`canDeriveChangedFiles?()` + 「absent → `listChangedFiles` 経路へフォールスルー」で、fail-closed は predicate を明示実装した real runtime（managed）のみで効き、既存 fake は無改変。`true`/absent は #689 挙動と完全一致。
- **optional の残穴を arch で塞ぐ（要件5）**: optional ＋ absent フォールスルーは、将来の real runtime が predicate 実装を忘れると黙って fail-open に戻る穴を残す。これは #689 の「歯で機械固定」思想と相性が悪いので、`src/core/runtime/` の具象 `RuntimeStrategy` 実装に predicate 実装を arch で必須化し、「fake のための optional」と「real runtime の fail-closed」を両立する。**Known Debt/follow-up に流さず本 request 内で閉じる**判断（cheap・on-thesis・deferral trap 回避）。
- **UNKNOWN は breach と別 finding、ただし同一経路**: scope を「検証できなかった」と「超過した」は別事象なので finding 文言・options を分ける。が、`decision-needed`・`origin:"scope"`・decision-ledger・escalation 導出は #689 のまま共有し、並行機構を新設しない。
- **評価可能性は runtime kind ではなく port predicate で判定**: scope-check（domain）が local/managed の kind を知るのは B-1（domain → adapter 非依存）違反。port の predicate 越しに問う。
- **fail-closed の既定は escalation であって拒否ではない**: 評価不能を自動却下せず人間に倒す。options に「リスク受容で進める」を含めることで、評価不能な runtime でも人間判断で前進できる逃げ道を残す（#689 D6 の「出口は人間へ」を踏襲）。
- **依存**: 本 request は #689（permissionScope / scope.ts / scope-check.ts / origin marker）の上に乗る。#689 はマージ済み（`d2f6b6245`）。

---

## 起票時 main 照合（reviewer: Claude）

本文の「検証済み」前提は main（#689 マージ済み = `d2f6b6245`）に対し実コードで全件確認済み: `listChangedFiles` 契約=`runtime-strategy.ts:370,380` / managed 構造的 `[]`=`managed.ts:488-496` / local catch→`[]`=`local.ts:655-668` / predicate 不在=`runtime-strategy.ts:143` / activation 消費者=`executor.ts:204` / 核心: managed が `runtimeStrategy: this`（`managed.ts:292`）で early guard を通過し predicate 分岐が発火（local も `local.ts:565`）。

影響を受ける既存 test fake の実数 ≈10（型注釈 `: RuntimeStrategy` / `as RuntimeStrategy` で 9、`listChangedFiles` を持つ full-shape fake で 10）。当初の「14+」は `RuntimeStrategy` 参照ファイル総数（14）を fake 数と取り違えた過大計上で、≈10 に訂正。要件1の optional 決定はこの照合で見つかった「additive を謳いつつ必須メソッド」という内部矛盾の解消であり、要件5（real runtime への predicate 実装の arch 固定）はその optional 化が残す「将来 real runtime の取りこぼしで fail-open に戻る穴」を塞ぐためのもの。
