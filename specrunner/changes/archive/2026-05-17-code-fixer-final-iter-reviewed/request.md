# code-fixer 最終 iter の修正成果を必ず code-review に渡してから escalate する

## Meta

- **type**: spec-change
- **slug**: code-fixer-final-iter-reviewed
- **base-branch**: main
- **date**: 2026-05-16
- **author**: color4pen
- **issue**: #269

## 背景

`src/core/pipeline/pipeline.ts:276-295` の exhaustion 判定は loop step (`spec-review` / `verification` / `code-review`) に入る直前で `loopIters.get(nextStep) ?? 0 >= maxIterations` を比較する。code-fixer / spec-fixer / build-fixer は `loopNames` に含まれず iter counter を持たないため、fixer は何度走っても counter に反映されない。

結果として:

1. code-review iter 1 → needs-fix
2. code-fixer iter 1 → 一部修正
3. code-review iter 2 → needs-fix (`loopIters["code-review"] = 2`)
4. code-fixer iter 2 → 残りを修正 (= 最終 iter で実態は green になっている)
5. 次に code-review iter 3 を起動する直前で `2 >= 2` が成立し escalate

= **fixer の最終 iter の成果物は一度も review されないまま halt** する。これは pipeline の意図 (= fixer が直したなら review に判定を渡す) に反する構造バグ。

最近の観測例:
- request `managed-reset-status-stale-guard` で再現 (commit `3c019fc` の fixer 修正は実際に F-04 を直していたが review に渡らず halt)
- review が誤検知 (幻覚) で needs-fix を返した場合にも同様に halt

関連 issue: #269

## 目的

fixer の最終 iter (= maxIterations 回目の fixer) の成果物を **必ず一度** 対応する review (code-review / spec-review / verification) に渡し、その verdict によって approved / escalation の分岐を決定する。review 回数の上限を「fixer の上限 + 1」に拡張することで「fixer が直したなら review が判定する」順序を保証する。

## 設計判断

1. **採用案: 「review は fixer + 1 回まで実行する」**: maxIterations の意味を「fixer 試行回数の上限」に再定義し、review はそれより 1 多く (fixer が走った直後の review を含む) 実行できるようにする。issue 提案の B 案相当。

2. **代替案 (不採用) と理由**:
   - 案 A (review を maxIter+1 まで許す = 単純に閾値 +1): 同じ結果になるが「+1 の意味」が曖昧で将来読み解けない。
   - 案 C (fixer 直後は無条件で review を 1 回走らせる): 条件分岐が分散し pipeline state machine が複雑化する。

3. **対象 loop step の範囲**: 影響する pair は以下 3 組のみ (`src/core/pipeline/types.ts:60-86` の transitions より):
   - `code-review` ↔ `code-fixer`
   - `spec-review` ↔ `spec-fixer`
   - `verification` ↔ `build-fixer`
   全てに対し同じ semantic を適用する。

4. **exhaustion check の判定改訂**:
   - 現状: `loopIters.get(nextStep) ?? 0 >= maxIterations` で次 loop step に入る前に halt
   - 改訂: 「直前 step が fixer で、その fixer が `nextStep` (= review) の pair である」場合は exhaustion check を **1 回だけスキップ**して review iter を許可する
   - fixer 自体の試行回数は別 counter (`fixerIters: Map<string, number>`) で追跡し、`fixerIters.get(fixerName) >= maxIterations` で fixer 側の上限を gate する

5. **`handleExhausted` の resumePoint メタ**: 「fixer 最終 iter を経た上で review が approve しなかった」escalation と「fixer に到達する前に review が exhaust した」escalation を区別できるよう `resumePoint.exhaustionPhase: "review-after-final-fix" | "review-exhausted"` 等を持たせる (resume #236 改善の前提)。

6. **review iter 数の絶対上限**: 改訂後 review は最大 `maxIterations + 1` 回。これを超える escalation は従来通り `handleExhausted` で escalate。

7. **fixer / review pair の定義場所**: `src/core/pipeline/run.ts:54-62` の `loopNames` 設定箇所に隣接させて `loopFixerPairs: Map<reviewName, fixerName>` (or 逆方向) を定義する。pair 不在の loop step (= fixer を持たない pure loop) は従来通りの exhaustion 挙動。

## 要件

### 1. fixer 試行回数の独立追跡

`src/core/pipeline/pipeline.ts` の loop iteration tracking に fixer 用 counter を追加する:

- `fixerIters: Map<string, number>()` を `loopIters` と並列で保持
- `loopFixerPairs` (= review→fixer name のマップ) を pipeline コンストラクタで受け取る
- fixer step に入る直前で `fixerIters.set(fixerName, prevFixerIter + 1)` をインクリメント

### 2. exhaustion check の改訂

`src/core/pipeline/pipeline.ts:276-295` の判定を以下に変更:

- 次 step が loop step (= review) のとき:
  - 直前 step が `loopFixerPairs[nextStep]` (= 対応 fixer) で、その fixer の iter が `maxIterations` に達している場合のみ、review の exhaustion check を **bypass** して 1 回だけ追加実行を許可する
  - 上記以外は従来通り `loopIters.get(nextStep) >= maxIterations` で halt

- fixer 側の exhaustion: `fixerIters.get(fixerName) >= maxIterations` で halt。fixer は最大 maxIterations 回で打ち切り。

### 3. `handleExhausted` の resumePoint 拡張

`src/core/pipeline/pipeline.ts:360-398`:

- `resumePoint.exhaustionPhase` を新設し以下のいずれかを設定:
  - `"review-after-final-fix"`: fixer の最終 iter を review した上で approve されなかった
  - `"review-exhausted"`: fixer の最大 iter に到達する前の review exhaust
- 既存の `iterationsExhausted` field は維持 (互換性)

### 4. `loopFixerPairs` 定義の追加

`src/core/pipeline/run.ts:54-62` 周辺で pipeline 初期化時に以下を渡す:

```typescript
loopFixerPairs: {
  [STEP_NAMES.CODE_REVIEW]: STEP_NAMES.CODE_FIXER,
  [STEP_NAMES.SPEC_REVIEW]: STEP_NAMES.SPEC_FIXER,
  [STEP_NAMES.VERIFICATION]: STEP_NAMES.BUILD_FIXER,
}
```

pair の片側 (fixer) が存在しない loop step が将来追加された場合に備え、未定義 key は「fixer 不在 → 従来挙動」として扱う。

### 5. transitions 表との整合

`src/core/pipeline/types.ts:60-86` の transitions:

- fixer から review への遷移 (= `{ step: CODE_FIXER, on: "approved", to: CODE_REVIEW }` 等) は変更不要
- review の `escalation` 遷移先 (`to: "escalate"`) も変更不要 (handleExhausted 経路で処理)

### 6. test

`tests/pipeline-integration.test.ts` に以下のテストを追加:

- TC: `maxRetries = 2`, code-review iter 1 needs-fix → code-fixer iter 1 → code-review iter 2 needs-fix → code-fixer iter 2 → **code-review iter 3 が走ること** → approved で完走
- TC: 上記同条件で code-review iter 3 が needs-fix を返した場合に escalation し `resumePoint.exhaustionPhase === "review-after-final-fix"` であること
- TC: spec-review / spec-fixer pair で同じ挙動が成立すること
- TC: verification / build-fixer pair で同じ挙動が成立すること
- TC: fixer が無い loop step (= 仮にそういうものがあれば、または mock 構成で) は従来挙動を維持
- 既存 TC-060 (code-review needs-fix → code-fixer → approved) が regression していないこと
- TC-061 (`maxRetries: 2` で code-review が 2 回 needs-fix → exhaustion) は本 request で意味論が変わるため **更新が必要**。新 semantic では同条件で code-review iter 3 が走るため、`codeReviewArr.length === 3` を期待する形に書き換える。さらに「fixer 最終 iter 後の review iter で needs-fix → exhaustion」を検証する新 TC を追加し、旧 TC-061 の趣旨 (= exhaustion 検証) を継承する

### 7. spec authority への反映

権威 spec を調査の上、以下のいずれかで対応:

- `specrunner/specs/step-execution-architecture/spec.md` (loop step の挙動を扱う capability があれば) を MODIFIED で更新し、「fixer 最終 iter 後の review 1 回保証」「fixerIters と loopIters の分離」を明記
- 既存に該当 capability が無い場合は新規 capability `pipeline-loop-exhaustion` を ADDED で立てる (調査の結果次第)

調査結果を design.md に記録し、判断根拠 (= 既存 spec のどこを見て決めたか) を明示する。

## スコープ外

- `loopNames` 自体の設計見直し (= fixer を loopNames に含める案、verification の build-fixer pair の有無の再定義など)
- resume `--from` の default 経路改善 (#236 関連、別 request)
- exhaustion 時に review verdict の確証性を後から検証する仕組み (= review 幻覚の誤検知問題そのもの、別軸)
- pipeline 全体の atomicity (= #257 の Phase 1 commit rollback 等)
- `maxIterations` を per-loop で別値にする (= per-step config 化、別 request)

## 受け入れ基準

- [ ] `src/core/pipeline/pipeline.ts` の exhaustion check が fixer 最終 iter 直後の review を 1 回許可する実装になっている
- [ ] `fixerIters` counter が追加され、fixer 側の上限は `maxIterations` で gate されている
- [ ] `loopFixerPairs` が `src/core/pipeline/run.ts` で初期化され pipeline に渡されている
- [ ] `handleExhausted` の resumePoint に `exhaustionPhase` field が追加され適切に分岐する
- [ ] 新規追加 TC が pass
- [ ] TC-060 (既存) が regression していない
- [ ] TC-061 が新 semantic (`codeReviewArr.length === 3`, fixer 最終 iter 後の review が走る) で書き換えられ pass する
- [ ] 「fixer 最終 iter 後の review で needs-fix → exhaustion」検証の新 TC が追加され pass する
- [ ] `bun run typecheck && bun run test` が green
- [ ] 該当 spec capability が MODIFIED で更新されている (or 新規 capability が ADDED されている)
- [ ] 観測例の request (`managed-reset-status-stale-guard` 相当) を再現する scenario test が pass する

## Workflow Options

- enabled: []
