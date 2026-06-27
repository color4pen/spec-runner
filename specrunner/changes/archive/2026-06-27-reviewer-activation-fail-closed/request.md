# reviewer 活性化ゲートの「変更ファイル導出不能時の無言 skip」を fail-closed に揃える

## Meta

- **type**: spec-change
- **slug**: reviewer-activation-fail-closed
- **base-branch**: main
- **adr**: true

## 背景

custom reviewer には `paths` 条件を付けられる（例: `src/auth/**` 変更時のみ security レビューを走らせる）。活性化ゲート（`executor.ts`）は変更ファイル一覧を取得して条件を評価し、非該当なら reviewer を skip する。

問題は managed runtime では変更ファイルを取得できないこと（local git worktree が無く `git diff` 不可）。`listChangedFiles` が `[]` を返すため、path 条件付き reviewer は常に「該当ファイルなし」と判定され **skip される**。実際には該当ファイルが変わっているかもしれないのに、security レビュー等が**無言で消え**、PR が「レビュー通過」のように進む。記録される skipReason も「変更ファイルが条件に一致せず」となり、実態（変更ファイルを導出できなかった）と乖離する。

**核心は内部の不整合**: 隣接する scope-check は同じ状況（`canDeriveChangedFiles() === false`）を **fail-closed**（UNKNOWN finding を synthesize）で扱うのに、活性化ゲートは `canDeriveChangedFiles()` を確認せず `[]` で skip ＝ **fail-open**。さらに managed runtime の comment は現挙動を意図的な「fail-safe: under-activate」と記しており、scope-check の方針およびプロジェクトの fail-closed escalation 不変条件と矛盾する。本 request はこの不整合を解消し、「変更ファイルを導出できない時に path 条件付き reviewer を無言で skip しない」ことを保証する。

## 現状コードの前提

- `src/core/step/executor.ts:221-233` — 活性化ゲートは `canDeriveChangedFiles()` を確認せず `deps.runtimeStrategy.listChangedFiles(...)` を直接呼び、結果で `evaluateActivation` → 非活性なら `finalizeSkippedStep` で skip する。
- `src/core/runtime/managed.ts:514` — `listChangedFiles` は無条件で `[]` を返す（未サポート）。`src/core/runtime/managed.ts:527` — `canDeriveChangedFiles()` は `false` を返す。
- `src/core/runtime/managed.ts:506-512` — comment は `[]` 返却を「fail-safe: under-activate rather than evaluate against stale or fabricated data」と記し、現挙動を意図的としている（本 request はこの方針を見直す）。
- `src/core/step/scope-check.ts:49` — `canDeriveChangedFiles?.() === false` を先に確認し、導出不能なら `listChangedFiles` を呼ばず `synthesizeScopeUnverifiableFinding` で fail-closed にする。
- `src/core/port/runtime-strategy.ts:400` — `canDeriveChangedFiles?(): boolean` port メソッド。

## 要件

1. 活性化ゲートも `canDeriveChangedFiles()` を先に確認する。導出不能（`false`）の場合、空の変更ファイル一覧で path 条件付き reviewer を **skip しない**（無言の under-activate をやめる）。
2. 導出不能時の fail-closed 挙動を定める（「設計判断」参照）。最低限、path 条件付き reviewer が無言で消えないこと、および skipReason が「導出不能」と「条件不一致」を区別することを保証する。
3. `paths` 条件を持たない reviewer（無条件活性）は現挙動どおり影響を受けない。
4. local runtime（`listChangedFiles` が機能する）は現挙動どおり回帰しない。

## スコープ外

- managed runtime で実際に変更ファイルを導出する実装（worktree 無しでの diff。別件・大きい）。
- scope-check 自体の挙動（既に fail-closed）。
- 他の confirmed findings（B-12 grep / doctor / github-client / resume 兄弟）。

## 受け入れ基準

- [ ] managed runtime（`canDeriveChangedFiles()===false`）で path 条件付き reviewer が無言 skip されないことをテストで固定する（採用した fail-closed 挙動を検証）。
- [ ] local runtime で path 条件の活性/非活性が現挙動どおりであることをテストで固定する（回帰なし）。
- [ ] `paths` 条件なし reviewer が影響を受けないことをテストで固定する。
- [ ] skipReason が「導出不能」と「条件不一致」を区別することをテストで固定する。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

**前提（要 architect 確定）**: managed runtime の現 comment「under-activate = fail-safe」と、scope-check の fail-closed 方針が**矛盾**している。本 request はこの方向を統一する。

- **却下: 現状維持（under-activate を fail-safe とみなす）** — security レビューを無言で落とすのは安全でなく、scope-check の fail-closed 方針およびプロジェクトの fail-closed escalation 不変条件と矛盾する。
- **採用候補（design/architect が1つに確定）**:
  - **(a) 推奨: 導出不能時は reviewer を活性化して走らせる**（「判定できない＝該当しうる」に倒す）。最も軽量で「レビューを落とさない」を満たす。reviewer は paths を見ずに全体をレビューする形になる。job を halt しない。
  - (b) scope-check と同じく escalation（UNKNOWN finding を synthesize して人間に委ねる）。一貫性は最も高いが、managed + path reviewer の毎 run で halt し運用が重い。
- どちらも「無言 skip より安全側」。(a) を推奨するが、managed の `listChangedFiles` の意図的 under-activate comment と正面から対立するため、最終方向は architect / spec-review に委ねる（必要なら escalation で見直す）。
- 外部制約なし（内部 runtime 契約のみ）。
