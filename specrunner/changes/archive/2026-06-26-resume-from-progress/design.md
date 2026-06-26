# Design: resume-from-progress

## Context

SpecRunner の README は「Kill the process, reboot — the next run picks up where things stood.」を保証する。しかし graceful な停止（Ctrl-C / SIGTERM / escalation / 予算切れ）だけが `resumePoint` を書く。hard crash（kill -9 / OOM / コンテナ回収 / 電源断）ではシグナルハンドラが走らないため、`resumePoint` も interruption record も書かれず、ジョブは `status=running` / `step=<中断 step>` のまま残る。

現在のコードでは `resume.ts:163-166` に次のガードがある。

```ts
if (resumePoint === null && this.options.from === undefined) {
  logError("再開位置が不明です。`--from` で再開 step を指定してください");
  throw new PrepareError(1, "No resume point");
}
```

一方で `state.step` は各 agent step 実行**前**に `store.update(jobState, { step: step.name })` で永続化される（`executor.ts:206`）。hard crash が起きても `state.step` にはクラッシュ直前に開始されていた step 名が残る。

`resume.ts:148` の escalation チェックでは既に `state.step` を参照している事実からも、データが利用可能であることは確認済み。

```ts
const startStepForCheck = resumePoint?.step ?? (state.step ? toStepName(state.step) : undefined);
```

このデータを `resolveResumeStep` に渡すだけで hard crash resume が成立する。新規の書き込みは不要。

## Goals / Non-Goals

**Goals**:

- hard crash 後の `resume` が `state.step` から再開 step を導出し、成功するようにする。
- resume step 決定順序を **`--from` → `resumePoint.step` → `state.step`** に統一する。
- 1 step も開始していないジョブ（`state.step === "init"`）のみ、従来通り「再開位置が不明」で失敗させる。
- inbox 自動回復が `resumePoint` のない stale running job を 1 サイクルで回復できるようにする。

**Non-Goals**:

- `resumePoint` を毎 step 書き込んで鮮度を保つ（`state.step` フォールバックで足りるため不要）。
- hard crash 時に `resumePoint.reason` / `iterationsExhausted` を合成する（resume ロジック非依存の cosmetic 項目）。
- mid-step の途中再開（step 粒度の既存意味論に一致）。
- cancel の永続化順序、managed シグナルハンドラの interruption 追記、`--no-worktree` archive の冪等性、fresh-persist 順序（別 request スコープ）。
- ジョブ作成直後・最初の step 永続化前クラッシュの回収（`state.step === "init"` ウィンドウ、別 finding）。
- ループ予算の resume 引き継ぎ（毎 run フレッシュ初期化を維持）。

## Decisions

### D1: `resolveResumeStep` に `stateStep` フォールバックパラメータを追加する

`src/core/resume/resolve-step.ts` の `resolveResumeStep(from, resumePoint)` に第 3 引数 `stateStep?: string` を追加する。解決順序は次の通り。

1. `from` が有効 step 名 → 即 return。
2. `from` が不正 step 名 → 既存エラー（利用可能 step 名リスト付き）。
3. `from` undefined + `resumePoint !== null` → `resumePoint.step` を return。
4. `from` undefined + `resumePoint === null` + `stateStep` が有効 pipeline step → `toStepName(stateStep)` を return。
5. すべて該当しない → throw "Cannot resolve resume step"。

**Rationale**: 解決ロジックを `resolveResumeStep` に集約することで呼び出し側のプリガードが不要になり、将来の呼び出し経路が増えても一貫した優先順位が保証される。

**却下案**: 呼び出し側（`resume.ts`）でプリガードの前に `state.step` チェックを追加する。→ 解決ロジックが分散し、呼び出し側が増えると一貫性が崩れる。

### D2: `stateStep` の有効性を `ALL_STEP_NAMES_SET` で判定する

`state.step` は `"init"`（ジョブ初期値・pipeline step ではない）から始まる。`stateStep` を受け入れる前に `ALL_STEP_NAMES_SET.has(stateStep)` で判定し、`"init"` やその他の非 pipeline 値はフォールスルーさせて throw に到達させる。

**Rationale**: `"init"` を特殊ケースするより、「pipeline の有効 step 名かどうか」という汎化した判定の方が将来の synthetic step 名追加に対してロバスト。

### D3: `resume.ts:163-166` のプリガードを削除し、`state.step` を渡す

プリガード（`resumePoint === null && from === undefined` → throw）は D1 の `resolveResumeStep` の throw 経路（優先度 5）に完全に包含される。プリガードを残すと `stateStep` フォールバックに到達できないため、削除する。

呼び出しを次のように変更する。

```ts
// before
startStep = resolveResumeStep(this.options.from, resumePoint);

// after
startStep = resolveResumeStep(this.options.from, resumePoint, state.step);
```

`state` はプリガード削除時点では stale 検出後の回復済み state（`awaiting-resume` に遷移済み）を参照する。`state.step` の値は stale 検出前後で変わらないため問題ない。

### D4: `resumeContext` は hard-crash resume 時に `undefined` のまま維持する

`resume.ts:264` の次のコードは変更しない。

```ts
resumeContext: resumePoint && startStep === resumePoint.step ? { resumePoint } : undefined,
```

hard crash では `resumePoint` が null のため `resumeContext` は `undefined` になる。resume プロンプトに中断理由が付かないだけで機能上の影響はなく、最小差分を維持する。

## Risks / Trade-offs

**[Risk] 中断 step が副作用（ファイル書き込み・git commit）を途中まで実行していた場合** → Mitigation: `resumePoint` ベースの既存 resume も step 粒度で頭から再実行する同じ意味論を持つ。Step が自身の冪等性を保証する設計は変わらない。この request はその設計を引き継ぐだけ。

**[Risk] `state.step` が pipeline に存在しない step 名（将来追加の合成 step）を指す場合** → Mitigation: `ALL_STEP_NAMES_SET` チェックが false を返し、フォールバック不採用で throw になる。既存の `--from` 未指定 + `resumePoint` なしと同じエラー動作に収束する。

**[Risk] `resume.ts` のプリガード削除で早期失敗パスが消える** → Mitigation: `resolveResumeStep` の throw（優先度 5）が同等のエラーを返す。エラーメッセージはやや変わるが、log される点は同一。

## Open Questions

なし。すべての設計判断は request の architect 評価済みセクションで解決済み。
