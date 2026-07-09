# Tasks: 設計層 topic 排出

## T-01: `topicEmission` を config スキーマ・resolver・全 ResolvedDesignLayer リテラルへ追加

- [ ] `src/config/schema.ts` の `DesignLayerConfig`（464-481）に `topicEmission?: boolean`（JSDoc: designLayer.enabled
      配下でのみ意味を持つ、既定 true）を追加する。
- [ ] `ResolvedDesignLayer`（1244-1248）に required な `topicEmission: boolean` を追加する。
- [ ] `resolveDesignLayerConfig`（1255-1261）に `topicEmission: config.designLayer?.topicEmission ?? true` を追加する。
- [ ] config 検証スキーマの `designLayer` object（schema.ts:1021-1041）に `topicEmission: optional(boolean(...))` を追加する。
- [ ] `ResolvedDesignLayer` を構築する残り 2 箇所を無効リテラルとして更新する:
      `src/core/archive/orchestrator.ts:291` の `noopDesignLayer` と `src/cli/archive.ts:138` の `disabledDesignLayer` に
      `topicEmission: false` を追加する。
- [ ] `grep -rn "requireCitationTypes:" src` で `ResolvedDesignLayer` リテラル漏れがないことを確認する。

**Acceptance Criteria**:
- `resolveDesignLayerConfig` は `topicEmission` 未指定で true、`false` 指定で false を返す。
- `topicEmission` の追加後も `typecheck` が green（全リテラルが新 required フィールドを持つ）。
- config 検証は `designLayer.topicEmission` に非 boolean を与えると検証エラーを返す。

## T-02: 純粋な収集・slug 導出・本文生成ロジックを新設

- [ ] `src/core/design-layer/topic-emission.ts` を新設する（mark-hook と同層）。
- [ ] `collectTopicCandidates(state: JobState): TopicCandidate[]` を実装する。`TopicCandidate` は
      `{ finding: Finding; step: string; iteration: number; index: number }`。`state.steps` を走査し
      `f.resolution === "decision-needed" || f.origin === "scope"` を満たす finding を候補化する。
      走査順は決定的（step 名を辞書順、run を `attempt` 昇順、finding を配列 index 昇順）。`iteration` は
      `StepRun.attempt`、`index` は findings 配列の 0-origin 位置。
- [ ] dedupe を実装する。キーは `step|file|(line ?? "")|title`、最初の出現を採用する（既存
      `dedupeFindings` は provenance を落とすため流用しない）。
- [ ] `deriveTopicSlug(jobSlug, step, iteration, index): string` を実装する。生文字列
      `<jobSlug>-<step>-<iteration>-<index>` を小文字化 → `[^a-z0-9]` をハイフンへ → 連続ハイフンを 1 つに →
      先頭/末尾ハイフン除去し、`^[a-z0-9]+(-[a-z0-9]+)*$` に一致する slug を返す。
- [ ] `renderTopicFile(params): string` を実装する。flat frontmatter（`id: top-<slug>` と
      `source: specrunner:<jobSlug>/<step>-<iteration>#<index>`）+ 本文（title 見出し / rationale を症状 /
      severity・step・file(:line) を文脈）。decision ledger に一致があれば
      「暫定裁定（提案であって決定ではない）」節を label / consequence 付きで追加する。
- [ ] decision 照合は `src/core/decision/decision-ledger.ts` の `computeFindingKey` /
      `isFindingDecided` を import して用い、一致する `DecisionRecord` の `selectedOption` を取得する。

**Acceptance Criteria**:
- `collectTopicCandidates` は decision-needed と origin:"scope" のみを返し、fixable（origin なし）を除外する。
- 同一 (step,file,line,title) の重複は 1 件に畳まれ、最小 attempt の provenance を保持する。
- `deriveTopicSlug` の出力は常に `^[a-z0-9]+(-[a-z0-9]+)*$` に一致し、同一入力で同一 slug。
- `renderTopicFile` の出力は flat frontmatter（ネスト・複数行値なし）で `id`・`source` を持つ。
- 一致する decision があるときのみ「暫定裁定」節が出力される。

## T-03: `emitDesignTopics` — I/O オーケストレーション（縮退・冪等・独立ステージング・summary）

- [ ] 同ファイルに `emitDesignTopics(params): Promise<TopicEmissionResult>` を実装する。params は
      `{ slug, state, designLayer: ResolvedDesignLayer, recordDir, spawn, fs, stdoutWrite, stderrWrite }`。
      戻り値は `{ status: "skipped" } | { status: "emitted"; count: number; dir: string }`。
- [ ] 縮退: `designLayer.enabled !== true` または `designLayer.topicEmission !== true` なら即 `skipped`。
      `recordDir/design` が `fs.exists` で不在なら `skipped`（`design/` は作らない）。
- [ ] `recordDir/design/topics` が不在なら `fs.mkdir(..., { recursive: true })` で作成する。
- [ ] 候補ごとに slug を導出し、`design/topics/<slug>.md` が既存なら skip（上書きしない）、無ければ
      `renderTopicFile` の内容を `fs.writeFile` で書く。新規書き出し数を数える。
- [ ] 新規書き出しがあれば、その集合を `git add -- design/topics`（recordDir を cwd に）でステージする。
      このステージングは mark-hook とは独立に行う。
- [ ] best-effort: 内部の例外・`git add` 非 0 exit は escalation にせず `stderrWrite` で warning を出し、
      archive を継続する（`emitDesignTopics` は throw しない）。
- [ ] 可視化: 新規書き出し数 > 0 のときのみ `stdoutWrite` に 1 行（件数と `design/topics/` 先）を出す。
      0 件なら何も出さない。

**Acceptance Criteria**:
- enabled=false / topicEmission=false / design/ 不在の各条件で書き込み・git add・summary いずれも発生しない（skipped）。
- design/ 存在・topics/ 不在なら topics/ を作成して書き出す。
- 既存同名ファイルは上書きされず skip される。
- git add 失敗や writeFile 失敗でも throw せず warning を出して継続する。
- summary 行は新規書き出しが 1 件以上のときだけ出る。

## T-04: archive orchestrator へ配線（state 保持 + mark-hook 前に排出）

- [ ] `src/core/archive/orchestrator.ts` の Phase 0 で読み込んだ `state`（`state.steps` / `state.decisions` を含む）を
      Phase 1 から参照できるよう、必要フィールドを orchestrator スコープに hoist する（既存の
      jobId/branch/worktreePath/noWorktree/prNumber 抽出は変更しない）。
- [ ] `git add specrunner/changes/`（L284 付近）の後、mark-hook ブロック（L291 付近）の**前**に
      `emitDesignTopics` を呼ぶ。`designLayer` は `input.designLayer ?? noopDesignLayer`、`recordDir` を cwd、
      `stdoutWrite` は orchestrator の `stdoutWrite`、`stderrWrite` は既存の `stderrWrite` を渡す。
- [ ] 排出の戻り値によって archive のフローを分岐させない（best-effort、常に継続）。

**Acceptance Criteria**:
- 排出は mark-hook 呼び出しより前に実行され、mark-hook の成否に依存しない。
- `job archive --with-merge`（`runMergeThenArchive` → `runArchiveOrchestrator`）でも排出が走る（追加配線不要）。
- designLayer 不在（既存呼び出し）では `noopDesignLayer`（enabled:false）により no-op。

## T-05: ユニットテスト（収集・slug・書式・decision 併記）

- [ ] `src/core/design-layer/__tests__/topic-emission.test.ts` を新設する。
- [ ] 収集: decision-needed と origin:"scope" が候補化され、fixable が除外されることを検証する。
- [ ] dedupe: 同一 finding が複数 iteration に出ても 1 件、最小 attempt の provenance を保持することを検証する。
- [ ] slug: 代表入力で `design-topic-emission-spec-review-1-0` を返し、正規化が必要な入力でも
      `^[a-z0-9]+(-[a-z0-9]+)*$` に一致することを検証する。
- [ ] 書式: 生成ファイルが flat frontmatter・`id: top-<slug>`・`source: specrunner:<slug>/<step>-<iteration>#<index>` を
      持つことを検証する。
- [ ] decision 併記: 一致する `DecisionRecord` があるときのみ「暫定裁定（提案であって決定ではない）」節が
      label/consequence 付きで出ることを検証する。

**Acceptance Criteria**:
- 上記各ケースが green。slug 正規表現一致を明示的に assert する。
- fixable のみの state から候補 0 件・書き出し 0 件になることを検証する。

## T-06: 冪等・縮退テスト

- [ ] `emitDesignTopics` を fake fs で駆動し、既存同名ファイルがあるとき上書き・重複しないことを検証する
      （writeFile が該当 slug に対して呼ばれない）。
- [ ] enabled=false / topicEmission=false / design/ 不在の各条件で `skipped`（writeFile・git add・stdout いずれも
      発生しない）ことを検証する。
- [ ] design/ 存在・topics/ 不在で mkdir が呼ばれ書き出しが行われることを検証する。
- [ ] git add 非 0 exit / writeFile 例外で throw せず warning を出して継続することを検証する。

**Acceptance Criteria**:
- 冪等・縮退・best-effort の各条件が green。
- 既存の archive orchestrator テストが無変更で green（designLayer 不在 → no-op）。

## T-07: 統合テスト（archive commit へ含まれる / 両経路）

- [ ] orchestrator の統合テスト（`src/core/archive/__tests__/orchestrator.test.ts` へ追加、または新規テスト）で、
      `designLayer.enabled=true`・`topicEmission=true` かつ decision-needed / origin:"scope" finding を持つ state に対し、
      `design/topics/<slug>.md` が書き出され `git add -- design/topics` が呼ばれること（＝ archive commit 対象）を検証する。
- [ ] 排出が mark-hook 呼び出しより前に実行されることを spawn 呼び出し順序で検証する。
- [ ] `job archive --with-merge` 経路（`runMergeThenArchive`）でも排出が走ることを、orchestrator への委譲を通じて
      検証する（既存 merge-then-archive テストの designLayer 伝播を利用）。

**Acceptance Criteria**:
- 統合テストで書き出し + scoped git add（design/topics）が確認できる。
- 排出 → mark-hook の順序が確認できる。
- `typecheck && test` が green。既存テストは無変更で green。
