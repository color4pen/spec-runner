# Tasks: bite-evidence tamper 判定の provenance 化

<!--
実装対象の主なファイル:
  - src/core/port/runtime-strategy.ts          (D5: port method 追加)
  - src/core/runtime/local.ts                  (D5: local 実装)
  - src/core/runtime/managed.ts                (D5: managed 実装 = unavailable)
  - src/core/port/step-types.ts                (T-03: CliStepDeps に authorizedCanonWriters フィールド追加)
  - src/core/resume/canon-provenance.ts        (T-02: authorizedCanonWriterSteps helper 追加)
  - src/core/step/bite-evidence/tamper.ts      (D1/D2/D4: 分類ロジック書き換え)
  - src/core/step/bite-evidence/step.ts        (D1/D3: provenance 入力の計算と配線)
  - src/core/step/bite-evidence/gate.ts        (D4: reason 文字列のみ変更、routing 不変)
  - src/core/step/bite-evidence/__tests__/gate.test.ts (更新許容 pin ケースの更新 + 新規テスト)

TamperStatus union ("match" | "mismatch" | "inconclusive") と gate routing は不変に保つ (D4)。

[注意: circular import 制約]
`pipeline/registry.ts` は `bite-evidence/step.ts` を import し（行 24）、
`step.ts` は `tamper.ts` を import する（行 30）。このため `tamper.ts` も `step.ts` も
`registry.ts` を import できない（`registry → step → tamper → registry` の循環になる）。
`authorizedCanonWriterSteps` helper は registry の import chain 外のモジュール
（`src/core/resume/canon-provenance.ts`）に配置し、`CliStepDeps` 経由で注入する。
-->

## T-01: durable な最終変更 commit を取得する port method を追加する

- [ ] `src/core/port/runtime-strategy.ts` に、指定 path を最後に変更した commit の
      OID と subject を返す method（例: `lastCommitTouchingPath(path: string, cwd: string)`）を
      **optional** で追加する。返り値は throw しない discriminated union:
      `{ kind: "found"; oid: string; subject: string } | { kind: "none" } | { kind: "unavailable"; reason: string }`。
- [ ] 同ファイル末尾の `RealRuntimeStrategy` 交差型に、この method を **required** で追加する
      （具体 runtime に compile-time 強制。既存の `listCommitChangedFiles` 等と同じ扱い）。
- [ ] `src/core/runtime/local.ts` に実装を追加する。`git log -1 --format=<oid><区切り><subject> -- <path>`
      を cwd で実行（区切りは US 制御文字 `\x1f` 等の衝突しにくいもの）。
      空 stdout → `{ kind: "none" }`、非 0 exit / spawn 例外 → `{ kind: "unavailable", reason }`、
      成功 → `{ kind: "found", oid, subject }`。stdout を汚さない既存 spawn 規約に従う。
- [ ] `src/core/runtime/managed.ts`（managed runtime）に実装を追加する。常に
      `{ kind: "unavailable", reason: <local worktree 不在の旨> }` を返す。

**Acceptance Criteria**:
- `RuntimeStrategy` port と `RealRuntimeStrategy` に新 method が宣言され、`typecheck` が green。
- local 実装が、対象 path を最後に変更した commit の subject（例: `spec-fixer: <slug>`）を
  `found` で返すことを、実 git repo を用いたユニットテストで確認する。
- local 実装が、履歴を持たない path に対し `none`、非 0 exit で `unavailable` を返すことを
  テストで確認する。
- managed 実装が常に `unavailable` を返すことをテストで確認する。
- 既存の Runtime 実装群が新 method 追加後も `typecheck && test` green。

## T-02: checkTamperStatus を provenance 分類へ書き換え、authorizedWriters 導出 helper を追加する

- [ ] `src/core/step/bite-evidence/tamper.ts` の `TamperStatus` union
      (`"match" | "mismatch" | "inconclusive"`) は **変更しない**（D4）。ドキュメンテーション
      コメントを provenance 意味論に更新する（`match`=認可された出自 / `mismatch`=認可外の出自 /
      `inconclusive`=判定不能）。
- [ ] `checkTamperStatus` を pure な provenance 分類関数に書き換える。新 signature（入力は
      すべて呼び出し側が用意した pure な値）:
      `checkTamperStatus(input: { authorizedWriters: ReadonlySet<string>; lastCanonCommitToken: string | null; worktreeDirty: boolean; evidenceAvailable: boolean }): { status: TamperStatus }`。
      分類ロジック（D1）:
      - `evidenceAvailable === false` → `inconclusive`
      - `worktreeDirty === true` → `mismatch`
      - `lastCanonCommitToken === null` → `inconclusive`
      - `authorizedWriters.has(lastCanonCommitToken)` → `match`
      - それ以外 → `mismatch`
- [ ] commit subject から step 帰属トークンを取り出す pure helper を追加する（例:
      `parseCommitToken(subject: string, slug: string): string | null`）。subject の先頭
      `<token>: <slug>` から `<token>` を返し、`<slug>` が一致しない／`: ` を含まない場合は
      `null`（＝認可外扱いに倒す。ただし呼び出し側で null token は authorizedWriters に無い
      文字列として `mismatch` になるよう扱う。トークン抽出失敗と「commit 不在」は区別すること）。
- [ ] `test-cases.md` の認可された所有 step 集合を pipeline descriptor から導出する pure helper
      を追加する。**配置は `tamper.ts` ではなく `src/core/resume/canon-provenance.ts`** とする。
      理由: `pipeline/registry.ts` が `bite-evidence/step.ts` を import し（行 24）、`step.ts` が
      `tamper.ts` を import するため（行 30）、`tamper.ts` から `registry.ts` を import すると
      `registry → step → tamper → registry` の静的 circular import が生じる。`canon-provenance.ts`
      は `core/resume/` に属し registry の import chain 外にあるため安全（`declaredCanonWritesForStep`
      の先例と同じ状況）。
      - シグネチャ: `authorizedCanonWriterSteps(canonPath: string, steps: ReadonlyArray<readonly [string, import("../step/types.js").Step]>, state: JobState, deps: StepDeps): Set<string>`
        （descriptor 内の steps 配列を直接引数で受け取る — `registry` を内部 import しない）。
      - 全 step を走査し `step.writes?.(state, deps)` に `canonPath` を含む step 名を集める。
      - 導出結果に operator 適用トークン `operator-apply` を加える。
      - 例外時は空集合を返す（呼び出し側が evidence 不十分として扱う）。
- [ ] 旧実装が参照していた `LineageRecord` ベースの test-case-gen 凍結 hash 照合ロジックを削除する。

**Acceptance Criteria**:
- `checkTamperStatus` が新 signature の pure 関数として、上記 5 分岐を正しく返すユニットテストが
  green（`match` / `mismatch` / `inconclusive` の各分岐）。
- `authorizedCanonWriterSteps` が `canon-provenance.ts` に追加され、標準 pipeline descriptor の
  steps 配列を渡したとき `test-cases.md` の所有 step として少なくとも `test-case-gen` と
  `spec-fixer` を含み、かつ `operator-apply` を含む集合を返すことをテストで確認する
  （実際の step 実装を必要とするため integration テストとして分類すること）。
- `parseCommitToken` が `spec-fixer: <slug>` → `"spec-fixer"`、`operator-apply: <slug>` →
  `"operator-apply"`、cross-slug / 非準拠 subject → `null` を返すことをテストで確認する。
- `typecheck` green。

## T-03: bite-evidence step で provenance 入力を計算し配線する / gate reason を更新する

- [ ] `src/core/port/step-types.ts` の `CliStepDeps` インターフェースに、executor が事前計算して
      注入する新フィールドを追加する:
      `authorizedCanonWriters?: ReadonlySet<string>`
      executor（`pipeline/run.ts` または `step-executor.ts` 等、registry の import chain 外にある
      モジュール）が `authorizedCanonWriterSteps`（`canon-provenance.ts` 内）を呼び出して
      `test-cases.md` の所有 step 集合を事前計算し、`BiteEvidenceStep.run()` 呼び出し前に
      `deps.authorizedCanonWriters` として渡す。
- [ ] `src/core/step/bite-evidence/step.ts` の tamper 計算ブロック
      （現状の lineage fold + currentHash 計算）を provenance 入力の計算に置き換える:
      - `authorizedWriters` = `deps.authorizedCanonWriters`（executor 注入値）。
        `undefined` または空集合なら `evidenceAvailable=false` に倒す。
        （`step.ts` は registry を import できないため、自身では `authorizedCanonWriterSteps` を
        呼び出さない。`pipeline/registry.ts` が `step.ts` を import しているため循環になる。）
      - `lastCanonCommitToken` = `deps.runtimeStrategy.lastCommitTouchingPath(<path>, cwd)` の結果を
        `parseCommitToken` に通したトークン。`found` → トークン、`none` → `null`、`unavailable` →
        `evidenceAvailable=false`。
      - `worktreeDirty` = `deps.runtimeStrategy.listWorktreeChanges(cwd)` の結果に `test-cases.md`
        の path が含まれるか。`unavailable` → `evidenceAvailable=false`。
      - `evidenceAvailable` = 上記の照会がいずれも導出可能なら true。runtimeStrategy 不在
        （または新 method 不在の fake）なら false。
      - これらを `checkTamperStatus(...)` に渡し、得た `status` を gate に渡す。
      - 既存どおり、計算全体を try/catch で包み、例外時は `inconclusive` に倒す。
- [ ] `test-cases.md` の path は既存の `changeFolderPath(slug)` + `/test-cases.md` を用いる。
- [ ] `src/core/step/bite-evidence/gate.ts:104-111` の tamper mismatch 分岐の **routing は変更しない**
      （`mismatch → failed` のまま）。reason 文字列のみ provenance を反映した文言に更新する。
      文言には正規表現 `/tamper/i` に一致する語（`tamper`）を必ず残すこと
      （他 test 互換のため）。例: "tamper detected: current test-cases.md is not attributable to
      an authorized change path (owner step or operator-apply)"。
- [ ] gate の `GateDeps.tamperStatus` の型・受け渡しは不変（D4）。

**Acceptance Criteria**:
- `BiteEvidenceStep.run` が、fake runtime を用いた統合テストで、executor 注入の
  `deps.authorizedCanonWriters` と runtime port の provenance 照会から `tamperStatus` を
  計算し gate に渡すことを確認する（下記 T-04 の統合ケースで検証）。
- `CliStepDeps.authorizedCanonWriters` フィールドが追加され、`step.ts` がこれを参照する
  （registry の import chain を通じた循環依存が生じないことを typecheck で確認）。
- `gate.ts` の tamper reason が provenance を反映しつつ `/tamper/i` に一致する。
- `evidence-base-gate.test.ts` / `gate-empty-selection.test.ts`（生の `tamperStatus:"mismatch"` /
  `"inconclusive"` を gate に渡す既存 test）が **無変更で green**。
- `typecheck` green。

## T-04: テストを更新・追加して新契約を固定する

- [ ] `src/core/step/bite-evidence/__tests__/gate.test.ts` の「test-case-gen 固定基準」を pin する
      ケース（TC-032 群の `checkTamperStatus(lineage, currentHash)` 直呼び、および必要なら TC-006 の
      reason 期待）を新契約へ更新する。受け入れ基準により、この pin ケースのみ更新可。
      - `checkTamperStatus` の呼び出しを新 signature（`{ authorizedWriters, lastCanonCommitToken,
        worktreeDirty, evidenceAvailable }`）に置き換える。
      - `match` / `mismatch` / `inconclusive` の各分岐を新入力で固定する。
- [ ] 認可経路の偽陽性再現テストを追加する（受け入れ基準 1）: test-case-gen → spec-review →
      spec-fixer（正規編集）→ bite-evidence の経路を、fake runtime
      （`lastCommitTouchingPath` が `spec-fixer: <slug>` を返す／worktree clean）で構成し、
      `checkTamperStatus` が `match`（＝ gate 進行、非 failed）になることを固定する。
      可能なら `BiteEvidenceStep.run` レベルの統合ケースとして、gate verdict が tamper で
      `failed` にならないことまで固定する。
- [ ] operator 適用テストを追加する（受け入れ基準 2）: `lastCommitTouchingPath` が
      `operator-apply: <slug>` を返す構成で `match`（非 failed）を固定する。
- [ ] 認可外テストを追加する（受け入れ基準 3）:
      - 非所有 step 帰属: `lastCommitTouchingPath` が `implementer: <slug>` を返す構成で
        `mismatch` → gate `failed` を固定する。
      - 証跡外の書き換え: `worktreeDirty === true`（`listWorktreeChanges` に `test-cases.md` を含む）
        構成で `mismatch` → gate `failed` を固定する。
- [ ] 証跡欠落テストを追加する（受け入れ基準 4、D2）: lineage record が空／不在でも、durable な
      `spec-fixer: <slug>` commit 帰属が取得できる構成で `match`（非 failed）になることを固定する
      （「lineage 記録失敗でも偽陽性にならない」を証明）。
- [ ] 判定不能テストを追加する（D3）: `lastCommitTouchingPath` / `listWorktreeChanges` が
      `unavailable`、または authorizedWriters 導出不能の構成で `inconclusive` → gate 進行
      （非 failed）を固定する。

**Acceptance Criteria**:
- 上記の追加テストがすべて green。
- 認可経路（spec-fixer 正規編集・operator 適用）が tamper 扱いにならないことがテストで固定される。
- 認可外（非所有 step・証跡外の書き換え）が `failed` になることがテストで固定される。
- 証跡（lineage）欠落シナリオで偽陽性にならないことがテストで固定される。
- 更新したのは gate.test.ts の pin ケースのみで、`evidence-base-gate.test.ts` /
  `gate-empty-selection.test.ts` / `gate-no-test-materialize.test.ts` /
  `evidence-base-e2e-gate.test.ts` 等の他 test は無変更で green。

## T-05: 全体検証

- [ ] `bun run typecheck` が green。
- [ ] `bun run test` が green（新規・更新テストを含む全 suite）。
- [ ] 変更が Non-Goals（他保護正典への拡張・所有宣言変更・base/candidate 評価変更）に
      踏み込んでいないことを確認する。

**Acceptance Criteria**:
- `typecheck && test` が green。
- 変更範囲が bite-evidence tamper 判定（tamper.ts / step.ts / gate.ts reason）と、それを支える
  port method 追加（runtime-strategy.ts / local.ts / managed.ts）に限定されている。
