# Tasks: spec-review の周回間 context 注入

依存順: T-01 → T-02 → (T-03, T-04) → T-05 → T-06。T-01〜T-05 は実装、T-06 は検証・回帰。

## T-01: `DynamicContext` に `priorRoundContext` field を追加する

- [ ] `src/git/dynamic-context.ts` の `DynamicContext` interface に optional field を追加する（inline 構造型、`Finding` 等の domain 型を import しない — `factCheckAttestation` の前例に倣う）:
  ```
  priorRoundContext?: {
    findings: { severity: string; resolution: string; file: string; title: string }[];
    changedFiles: string[];
  };
  ```
- [ ] doc comment に「spec-review の `prepareRoundContext` が iteration ≥ 2 で populate する。他 step では absent。in-memory のみで state に永続化されない（one-shot）」旨を記す。
- [ ] `collectDynamicContext` は本 field を設定しない（既存挙動不変）。

**Acceptance Criteria**:
- `DynamicContext` に `priorRoundContext?` が追加され、`typecheck` が green。
- 既存の `DynamicContext` 構築点（`collectDynamicContext`）は無改変で、本 field は absent のまま。

## T-02: `src/core/step/prior-round-context.ts` を新規作成する（純関数 + 配線 + seam 呼び出し）

- [ ] `PriorRoundContext` 型をエクスポートする（`findings: { severity: string; resolution: string; file: string; title: string }[]` と `changedFiles: string[]`）。`DynamicContext.priorRoundContext` の型と構造一致させる。
- [ ] 純関数 `resolvePriorFixerOid(state: JobState): string | null` — `state.steps?.[STEP_NAMES.SPEC_FIXER]` の末尾要素の `commitOid ?? null` を返す。run が無ければ null。
- [ ] 純関数 `buildPriorRoundContextBlock(ctx: PriorRoundContext): string` — 以下を含むブロック文字列を生成する:
  - ブロック全体を `<prior-round-context>...</prior-round-context>` XML タグで囲む（injection 境界の明示。finding title / changedFiles パスはスキーマ拘束済み・リポジトリ相対パスだが、外部入力由来の文字列を初期メッセージに埋め込む際の防護方針を実装者判断に委ねないために明示する）。
  - 見出し（iteration ≥ 2 の前周 context であることを示す）。
  - 前周 findings 一覧（各 finding の severity / resolution / file / title）。findings が空なら「前周指摘なし」を明示。
  - 前周 fixer 変更 file 集合（`changedFiles` の各パス）。空なら「変更 file なし（machine-derived）」を明示。fixer 自己申告でなく commit diff 由来である旨を注記。
  - 再指摘プロトコル文言（T の受け入れ基準は D6・spec の該当 Requirement に対応）: (1) 現在内容の読み直し、(2) 不十分理由の rationale 明示・解消済みは再指摘禁止、(3) 全量列挙維持（前周 approve 済みの観点も含め全量列挙、免除は与えない）。
- [ ] async 配線 `derivePriorRoundContext(params: { state: JobState; iteration: number; cwd: string; runtimeStrategy: RuntimeStrategy | undefined }): Promise<PriorRoundContext | null>`:
  - `iteration < 2` → `null`。
  - `resolvePriorFixerOid(state)` が null → `null`。
  - `runtimeStrategy?.listCommitChangedFiles` が不在 → `null`。
  - `await listCommitChangedFiles(priorOid, cwd)` が `{ kind: "unavailable" }` → `null`。
  - 成功時: `getLatestJudgeFindings(state, STEP_NAMES.SPEC_REVIEW)`（`fixer-helpers.ts`）で前周 findings を取得し `{ severity, resolution, file, title }` に射影、`changedFiles = result.files`（空配列可）として `{ findings, changedFiles }` を返す。
- [ ] I/O は `runtimeStrategy` port の背後のみ（`node:child_process` / `git` を直接 import しない）。

**Acceptance Criteria**:
- `resolvePriorFixerOid` の単体テスト: 末尾 spec-fixer run の `commitOid` を返す / run 無し・commitOid 無しで null。
- `derivePriorRoundContext` の単体テスト（`listCommitChangedFiles` を mock）:
  - iteration ≥ 2 + 前周 fixer OID あり + mock が files を返す → `{ findings, changedFiles }` を返し、`changedFiles` が mock の返値（= 機械導出）と一致する。
  - iteration = 1 → `null`。
  - 前周 fixer OID 解決不能 → `null`。
  - `listCommitChangedFiles` が `unavailable` → `null`。
  - `runtimeStrategy` / `listCommitChangedFiles` 不在（managed 相当の fake）→ `null`。
- `buildPriorRoundContextBlock` の単体テスト: 読み直し・不十分理由の明示・全量列挙維持の各文言を含み、全量列挙を弱める免除文言を含まない。出力が `<prior-round-context>` で始まり `</prior-round-context>` で終わることを検証する。

## T-03: `AgentStep` に `prepareRoundContext` フックを追加し `SpecReviewStep` で実装する

- [ ] `src/core/port/step-types.ts` の `AgentStep` に optional メソッドを追加する:
  ```
  prepareRoundContext?(
    state: JobState,
    cwd: string,
    runtimeStrategy: RuntimeStrategy | undefined,
  ): Promise<Partial<DynamicContext> | null>;
  ```
  doc comment に「core の `buildStepContext` から起動され `runtimeStrategy` が使える。adapter 起動で port を持たない `enrichContext` とは層が異なる。返した partial は `deps.dynamicContext` へマージされる。null は enrich 省略」を明記する。`RuntimeStrategy` 型は既に step-types.ts で import 済み。
- [ ] `src/core/step/spec-review.ts` の `SpecReviewStep` に `prepareRoundContext` を実装する:
  - `computeSpecReviewIteration(state)` で iteration を求める。
  - `derivePriorRoundContext({ state, iteration, cwd, runtimeStrategy })` を呼ぶ。
  - 結果が非 null なら `{ priorRoundContext: result }` を返し、null なら `null` を返す。
- [ ] 既存の noop `enrichContext`（spec-review.ts:98-100）は変更不要（そのまま維持）。

**Acceptance Criteria**:
- `SpecReviewStep.prepareRoundContext` の単体テスト: iteration ≥ 2 で `listCommitChangedFiles` mock ありのとき `{ priorRoundContext: { findings, changedFiles } }` を返す。iteration 1 で `null` を返す。
- `typecheck` が green（他 step は `prepareRoundContext` 未実装で後方互換）。

## T-04: `buildStepContext` で `prepareRoundContext` を呼び dynamicContext にマージする

- [ ] `src/core/step/step-context-builder.ts` の `buildStepContext` で、`input.dynamicContext` を組み立てる前に次を行う:
  ```
  let dynamicContext = deps.dynamicContext;
  if (step.prepareRoundContext && dynamicContext) {
    try {
      const extra = await step.prepareRoundContext(state, cwd, deps.runtimeStrategy);
      if (extra) dynamicContext = { ...dynamicContext, ...extra };
    } catch {
      // best-effort: enrich に失敗しても step を止めない（黙って degrade）
    }
  }
  ```
- [ ] `AgentRunContext.input.dynamicContext` を `deps.dynamicContext` ではなくマージ後の `dynamicContext` に差し替える（builder は返った partial を無差別マージするだけで `priorRoundContext` を認識しない = step 非依存を維持）。

**Acceptance Criteria**:
- `buildStepContext` の単体テスト: `prepareRoundContext` を実装した fake step が返す partial が `ctx.input.dynamicContext` にマージされる。`prepareRoundContext` 未実装の step では `dynamicContext` が無改変。
- `prepareRoundContext` が reject しても `buildStepContext` は例外を投げず、`dynamicContext` は enrich 前のまま返る。
- 既存 `step-context-builder.test.ts` は無改変で green。

## T-05: spec-review message テンプレートに前周 context ブロックを配線する

- [ ] `src/prompts/spec-review-system.ts` の `SPEC_REVIEW_INITIAL_MESSAGE_TEMPLATE` に `{{PRIOR_ROUND_CONTEXT}}` placeholder を追加する（`<user-request>` ブロックの前後いずれか、review 指示より前の適切な位置）。
- [ ] `SpecReviewPromptInput` に `priorRoundContextBlock?: string` を追加する。
- [ ] `buildSpecReviewInitialMessage` で `{{PRIOR_ROUND_CONTEXT}}` を `input.priorRoundContextBlock ?? ""` で置換する（absent 時は空文字 = ブロック無し）。
- [ ] `src/core/step/spec-review.ts` の `buildMessage` で、`deps.dynamicContext?.priorRoundContext` があれば `buildPriorRoundContextBlock(...)` でレンダリングして `priorRoundContextBlock` に渡し、無ければ渡さない（`buildMessage` は pure のまま — `deps` 読み取り + 純関数呼び出しのみ）。

**Acceptance Criteria**:
- `deps.dynamicContext.priorRoundContext` を設定した状態で `SpecReviewStep.buildMessage` を呼ぶと、message に前周 findings（severity/resolution/file/title）・fixer 変更 file 集合・再指摘プロトコル文言が含まれる。
- `deps.dynamicContext.priorRoundContext` が absent なら message に注入ブロックは含まれない。
- `{{PRIOR_ROUND_CONTEXT}}` placeholder が message に literal で残らない（置換される）。

## T-06: エンドツーエンドの受け入れ基準を固定し既存テストの回帰を確認する

- [ ] iteration ≥ 2 の spec-review message に前周 findings と fixer 変更 file 集合が含まれることをテストで固定する（fixer 変更 file は `listCommitChangedFiles` の mock 経由で機械導出であることを検証）。
- [ ] iteration 1 では注入されないことをテストで固定する。
- [ ] 前周 fixer の commit OID が解決できない・diff unavailable の場合、注入が省略され step が正常続行することをテストで固定する。
- [ ] 再指摘プロトコル文言（読み直し・不十分理由の明示・全量列挙維持）が注入ブロックに含まれることをテストで固定する。
- [ ] 既存テスト（`src/prompts/__tests__/spec-review-full-enumeration-prompt.test.ts` / `src/core/step/__tests__/spec-review-fixer-routing.test.ts` / finding-recency 系 / `src/core/step/__tests__/step-context-builder.test.ts`）が無改変で green であることを確認する。
- [ ] `typecheck && test` が green。

**Acceptance Criteria**:
- 上記 4 つの振る舞い（iteration ≥ 2 注入 / iteration 1 非注入 / 導出不能時の省略 / プロトコル文言）がテストで固定されている。
- 既存 spec-review prompt / routing / finding-recency / step-context-builder テストが差分ゼロで green。
- `typecheck && test` が green。
