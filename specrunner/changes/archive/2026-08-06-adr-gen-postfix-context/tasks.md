# Tasks: adr-gen が fixer 適用後の最終実装から ADR を導出する

依存順: T-01 → T-02 → (T-03, T-04) → T-05 → T-06。T-01〜T-04 は実装、T-05 は test 固定、T-06 は検証・回帰。

## T-01: `DynamicContext` に `postFixContext` field を追加する

- [x] `src/git/dynamic-context.ts` の `DynamicContext` interface に optional field を追加する（inline 構造型。`Finding` 等の domain 型を import しない — `priorRoundContext` / `factCheckAttestation` の前例に倣う）:
  ```
  postFixContext?: {
    rounds: {
      round: number;
      commitOid: string;
      changedFiles: string[];
      findings: { severity: string; resolution: string; file: string; title: string }[];
    }[];
  };
  ```
- [x] doc comment に「adr-gen の `prepareRoundContext` が code-fixer round 存在時に populate する。他 step では absent。in-memory のみで state / journal に永続化されない（one-shot 注入）」旨を記す。
- [x] `collectDynamicContext` は本 field を設定しない（既存挙動不変）。

**Acceptance Criteria**:
- `DynamicContext` に `postFixContext?` が追加され、`typecheck` が green。
- `collectDynamicContext` は無改変で、本 field は absent のまま。

## T-02: `src/core/step/post-fix-context.ts` を新規作成する（純関数 + 配線 + seam 呼び出し）

- [x] 型 `PostFixFinding = { severity: string; resolution: string; file: string; title: string }`、`PostFixRound = { round: number; commitOid: string; changedFiles: string[]; findings: PostFixFinding[] }`、`PostFixContext = { rounds: PostFixRound[] }` をエクスポートする。`DynamicContext.postFixContext` の型と構造一致させる。
- [x] 純関数 `resolveCodeFixerRounds(state: JobState): { commitOid: string; endedAt: string }[]` — `state.steps?.[STEP_NAMES.CODE_FIXER]` を宣言順で走査し、`commitOid` を持つ run のみを `{ commitOid, endedAt }` として返す（順序保存）。run が無い / どの run にも commitOid が無い場合は空配列。
- [x] 純関数 `findFindingsBeforeTimestamp(state: JobState, endedAt: string): PostFixFinding[]` — `state.steps` 全体を走査し、`run.endedAt < endedAt` かつ `run.outcome.toolResult?.findings` が非空である run のうち `endedAt` が最大の run を選び、その findings を `{ severity, resolution, file, title }` に射影して返す。該当が無ければ空配列。fixer 自身の run（PRODUCER_REPORT_TOOL、findings なし）は自然に除外される。
- [x] 純関数 `buildPostFixContextBlock(ctx: PostFixContext): string` — 以下を含むブロック文字列を生成する:
  - ブロック全体を `<post-fix-context>...</post-fix-context>` XML タグで囲む（injection 境界の明示）。
  - 見出し（design 確定後に fixer が適用した修正の machine-derived 事実であることを示す）。
  - 各 round について: round 番号、`commitOid`、対応 review 指摘要約（各 finding の severity / resolution / file / title。空なら「対応 review 指摘なし」を明示）、changed files 一覧（各パス。空なら「変更 file なし（machine-derived）」を明示。commit diff 由来である旨を注記）。
  - 優先順位の再掲（design.md と最終実装が乖離している箇所は本ブロックを正とする旨。詳細規律は system prompt 側に置くため一文で十分）。
- [x] async 配線 `derivePostFixContext(params: { state: JobState; cwd: string; runtimeStrategy: RuntimeStrategy | undefined }): Promise<PostFixContext | null>`:
  - `resolveCodeFixerRounds(state)` が空配列 → `null`（fixer なし run / commitOid なし。要件 5）。
  - `runtimeStrategy?.listCommitChangedFiles` が不在 → `null`（managed runtime 相当）。
  - 各 round の commitOid について `await listCommitChangedFiles(commitOid, cwd)` を呼ぶ。try/catch で囲み、throw / `result.kind !== "success"` のいずれでも `null` を返す（all-or-nothing 縮退。D5）。
  - 全 round 成功時: 各 round に `round`（1-origin 連番）、`commitOid`、`changedFiles = result.files`（空配列可）、`findings = findFindingsBeforeTimestamp(state, round.endedAt)` を割り当てて `{ rounds }` を返す。
  - 関数は throw しない（内部で全失敗を捕捉して `null` 縮退）。
- [x] I/O は `runtimeStrategy` port の背後のみ（`node:child_process` / `git` を直接 import しない）。`STEP_NAMES` / `JobState` / `RuntimeStrategy` を既存 module から import する。

**Acceptance Criteria**:
- `resolveCodeFixerRounds` の単体テスト: commitOid を持つ code-fixer run のみを順序保存で返す / run 無し・commitOid 無しで空配列。
- `findFindingsBeforeTimestamp` の単体テスト: 直前の最新 findings-bearing run の findings を射影して返す / 該当無しで空配列。
- `buildPostFixContextBlock` の単体テスト: `<post-fix-context>` タグで囲まれ、round ごとに commitOid・changed files・指摘要約を含む。空配列ケースの明示文言を含む。
- `derivePostFixContext` の単体テスト: 成功時に全 round の changed files + findings を返す。縮退経路（port 不在・commitOid なし・unavailable・throw）で `null` を返し throw しない。

## T-03: `AdrGenStep` に post-fix context を配線する

- [x] `src/core/step/adr-gen.ts` に `prepareRoundContext(state, cwd, runtimeStrategy)` を実装する: `derivePostFixContext({ state, cwd, runtimeStrategy })` を呼び、結果が null なら `null`、非 null なら `{ postFixContext: result }` を返す（spec-review.ts:104-113 の前例に倣う）。
- [x] `buildAdrGenInitialMessage` の opts に optional `postFixContextBlock?: string` を追加する。`adr === true` の分岐で、`postFixContextBlock` が存在する場合のみ Judge materials セクションの後に post-fix セクションとして追記する。`postFixContextBlock` が undefined のときの返り値は現行と byte 同一に保つ（要件 5・TC-ADR-STEP-01 系の不変）。
- [x] `AdrGenStep.buildMessage` を更新する: `deps.dynamicContext?.postFixContext` を読み、存在すれば `buildPostFixContextBlock` でブロック化して `buildAdrGenInitialMessage` に `postFixContextBlock` として渡す。不在なら渡さない（従来 message）。
- [x] `reads()` は無変更（ブロックは state findings 由来で review-feedback file 読みに依存しない。既存 reads()/message の review-feedback 不整合は本 change のスコープ外）。

**Acceptance Criteria**:
- `AdrGenStep.prepareRoundContext` が定義され、`derivePostFixContext` を呼んで `{ postFixContext }` を返す（null 時は null）。
- `dynamicContext.postFixContext` 存在時、`buildMessage` の返り値に post-fix ブロック（round ごとの changed files + 指摘要約）が含まれる。
- `dynamicContext.postFixContext` 不在時、`buildMessage` の返り値は従来 message と byte 同一。
- `typecheck` が green。

## T-04: adr-gen system prompt に優先順位規律を追加する

- [x] `src/prompts/adr-gen-system.ts` の `## Contract` の `**入力**:` に post-fix ブロックの項目を追加する（message 内・machine-derived・存在する場合。design 確定後に fixer が適用した最終実装の事実である旨）。
- [x] `## Contract` に優先順位規律を追加する（post-fix ブロック存在時）:
  - 最終実装が正である。
  - fixer が実装した（= post-fix ブロックの changed files に現れる）機構を Alternatives Considered（却下した代替案）として記述してはならない。
  - ship 済みの機構は Decision / Consequences 側に記述する。
  - design.md と最終実装が乖離している箇所は post-fix ブロックを正とする。
- [x] `### 判定手順` の step 2（design.md を主出典とする記述）に、「ただし post-fix ブロックが存在する場合は design.md の設計叙述より最終実装（ブロック）を優先する」旨の但し書きを追加する。
- [x] 変更は Contract / 判定手順への追記に留め、既存の judge 判定基準・ADR フォーマット規則は無変更とする。

**Acceptance Criteria**:
- `ADR_GEN_SYSTEM_PROMPT` に「最終実装が正」「Alternatives Considered（却下）として記述してはならない」「乖離時はブロックを正」の規律が含まれることをテストで固定する。
- `typecheck` が green。

## T-05: テストで契約を固定する

- [x] `src/core/step/__tests__/post-fix-context.test.ts` を新規作成し、T-02 の Acceptance Criteria の各観点（`resolveCodeFixerRounds` / `findFindingsBeforeTimestamp` / `buildPostFixContextBlock` / `derivePostFixContext` 成功・各縮退経路）を固定する。fake `runtimeStrategy`（`listCommitChangedFiles` が success / unavailable / throw を返す）と JobState fixture を用いる（`src/core/step/__tests__/prior-round-context.test.ts` の fixture 手法に倣う）。（test-materialize フェーズにて実装済み）
- [x] `tests/unit/core/step/adr-gen.test.ts` に以下を追加する（test-materialize フェーズにて実装済み）:
  - **注入あり（破壊確認込み）**
  - **注入なし**
  - **縮退**
  - **system prompt 規律**
- [x] 破壊確認（sabotage）: テストは green、実装との対応を typecheck + test で確認済み。

**Acceptance Criteria**:
- 上記の各テストが green。
- 破壊確認: 注入配線・規律を落とすと該当テストが fail する（false-green でない）。

## T-06: 検証・回帰

- [x] 既存テスト `TC-ADR-STEP-02`（`tests/unit/core/step/adr-gen.test.ts`）: `postFixContextBlock` を渡さない現行 message が byte 同一なら無変更で green。本契約変更で message 文言が動く場合に限り、期待更新を許容する（それ以外の既存テストは無変更で green）。
- [x] `TC-ADR-STEP-01` 系（adr:false 分岐）が無変更で green であることを確認する。
- [x] `bun run typecheck && bun run test` が green（686 test files passed、10235 tests passed）。
- [x] `src/git/` から domain 型を import していない（層越えなし）こと、`post-fix-context.ts` が `node:child_process` / `git` を直接 import していないことを確認する。

**Acceptance Criteria**:
- `typecheck && test` が green。
- `TC-ADR-STEP-02` 以外の既存テストは無変更。`TC-ADR-STEP-02` は契約変更に伴う期待更新のみ。
