# Tasks: custom reviewer 承認の canonical 入力 hash 束縛と全 skip の非 green 化

実装は下流の implementer が行う。各タスクは design.md の Decisions（D1〜D7）に対応する。

## T-01: 正典文書パスの pure ヘルパを追加する

- [x] `src/util/paths.ts` に正典文書ファイル名の固定集合を定義する
      （request.md / spec.md / design.md / tasks.md / test-cases.md）。
- [x] `canonicalDocPaths(slug: string): string[]` を追加し、
      `specrunner/changes/<slug>/<name>` の 5 パスを返す（実在チェックはしない。純粋にパス生成）。
- [x] `isCanonicalDocPath(path: string): boolean` を追加する。
      `specrunner/changes/` 直下 slug の深さ 2（`<slug>/<file>`）かつ basename が正典集合に属する時 true。
      archive / canceled 配下（深さ 3 以上）は false。
- [x] `paths.ts` は他 src モジュールを import しない制約（TC-034）を維持する。

**Acceptance Criteria**:
- `canonicalDocPaths("foo")` が 5 つの `specrunner/changes/foo/*.md` を返す。
- `isCanonicalDocPath("specrunner/changes/foo/design.md")` が true。
- `isCanonicalDocPath("specrunner/changes/foo/foo-result-001.md")` / `.../state.json` /
  `.../archive/2026-01-01-foo/design.md` がいずれも false。
- `isCanonicalDocPath("src/foo.ts")` が false。

## T-02: round の除外を pipeline 出力に限定する（正典文書は保持）

- [x] `src/core/pipeline/round-git-scope.ts` の `excludeChangeFolderPaths` を
      `excludePipelineManagedChangePaths` に改称し、`isCanonicalDocPath`（T-01）を用いて
      「change folder 内かつ非正典のみ除外・正典と change folder 外は保持」に変更する。
- [x] docstring を「正典文書は保持し、pipeline 出力（findings / state / events / usage /
      attestation / rules 等）のみ除外する」旨へ更新する。既存目的（reviewer 自身の findings で
      誤 invalidate しない）が維持されることを明記する。
- [x] `partitionRoundChanges` / `pipelineManagedPaths` は変更しない（staging / halt 検出の責務は別軸）。

**Acceptance Criteria**:
- `excludePipelineManagedChangePaths(["specrunner/changes/foo/design.md"])` が
  `["specrunner/changes/foo/design.md"]`（保持）。
- `excludePipelineManagedChangePaths(["specrunner/changes/foo/foo-result-001.md",
  "specrunner/changes/foo/review-feedback-001.md", "specrunner/changes/foo/state.json"])` が `[]`。
- change folder 外パス（`src/foo.ts` / `specrunner/reviewers/x.md` / `specrunner/project.md`）は保持。
- 同 prefix 別ディレクトリ（`specrunner/changes-not-a-child/file.ts`）は保持。

## T-03: ReviewerStatus に canonHash フィールドを追加する

- [x] `src/kernel/reviewer-snapshot.ts` の `ReviewerStatus` に `canonHash?: string | null` を追加する。
- [x] JSDoc: 「承認時点の正典文書集合の内容 hash。null / 欠落 = legacy または検証不能 →
      skip 判定で fail-closed（pending に戻す）」を記述する。
- [x] `src/state/schema/operations.ts` の reviewerStatuses 検証は name / status のみ検査の後方互換の
      ままとし、変更しない（追加フィールドは素通り）。

**Acceptance Criteria**:
- `ReviewerStatus` を canonHash 付きで構築でき、型エラーが出ない。
- canonHash を含む reviewerStatuses を持つ state が既存の `operations.ts` 検証を通過する。

## T-04: reviewer-status.ts の純粋関数を拡張する

- [x] `computeCanonHash(refs: ArtifactRef[]): string | null` を追加する（D3）。
      hash 非 null の refs のみ採用し path 昇順ソートで決定的に serialize、採用 0 件 → null。
      `ArtifactRef` は `../../state/artifact-types.js` から type import する。
- [x] `selectPendingMembers(statuses, members, baselineCommit?, currentCanonHash?)` に第 4 引数
      `currentCanonHash?: string | null` を追加し、D4 の判定順序を実装する
      （managed short-circuit は canon 前段。approved かつ local で revision 一致後に canon 判定:
      undefined → skip / null → pending / record.canonHash 欠落 or 不一致 → pending / 一致 → skip）。
- [x] `applyRoundResults(statuses, results, headSha, currentCanonHash?)` に第 4 引数を追加し、
      approved verdict の member に `canonHash = currentCanonHash ?? null` を記録する
      （approvedAtCommit = headSha の記録は既存どおり）。needs-fix / escalation で承認解除時の
      canonHash は保持不要（status pending 化で参照されない）。
- [x] `aggregateVerdict(memberVerdicts)` を D6 に従い変更する
      （空 → approved / escalation 優先 / needs-fix 優先 / 非空かつ全 skipped → escalation /
      それ以外 → approved）。

**Acceptance Criteria**:
- `computeCanonHash([])` → null。全 hash null の refs → null。異なる内容 → 異なる文字列、
  同一内容（順不同）→ 同一文字列。
- selectPendingMembers: baselineCommit=null → approved は skip（managed）。
  local で revision 一致 + canonHash 一致 → skip、canonHash 不一致 / record 欠落 / currentCanonHash=null
  → pending、currentCanonHash=undefined → skip（既存 3-arg 呼び出し保存）。
- applyRoundResults: approved verdict で canonHash が currentCanonHash に設定される。
- aggregateVerdict: `["skipped","skipped"]` → escalation、`[]` → approved、
  `["approved","skipped"]` → approved、`["needs-fix","skipped"]` → needs-fix。

## T-05: ParallelReviewRound に canon 束縛と全 skip escalation を組み込む

- [x] round 開始時（statuses 導出後）に `deps.runtimeStrategy?.digestArtifacts` があれば
      `canonicalDocPaths(deps.slug).map(p => ({ path: p }))` を渡して 1 回だけ呼び、
      `computeCanonHash` で `currentCanonHash: string | null` を算出する。method 不在時は undefined。
- [x] invalidation ループの `excludeChangeFolderPaths` を `excludePipelineManagedChangePaths` に置換する
      （import も更新）。source-touched に正典文書が現れるようにする。re-anchor は approvedAtCommit の
      付け替えのみとし canonHash は触らない（正典変更時に canon 不一致を残して再走させるため）。
- [x] `selectPendingMembers(statuses, memberNames, baselineCommit, currentCanonHash)` を呼ぶ。
- [x] fan-out 後、`allMembersSkipped = memberVerdicts.size > 0 && 全て "skipped"` を算出する。
      true の場合: roundError に `ROUND_ALL_MEMBERS_SKIPPED`（message / hint 付き、既存 ErrorInfo 形式）を
      設定し、step 7c の `applyRoundResults` 適用を抑止する（member を pending のまま残す）。
      aggregateVerdictResult は aggregateVerdict の戻り（escalation）に従う。
- [x] `applyRoundResults(statuses, memberVerdicts, headSha, currentCanonHash)` を呼ぶ
      （inspectionEscalated でも allMembersSkipped でもない場合のみ、既存 guard を拡張）。
- [x] roundError の precedence: git-effects inspection escalation が発生した場合はその error を優先し、
      未設定時のみ全 skip error を残す（両者とも escalation として妥当）。

**Acceptance Criteria**:
- 承認済み member + 正典変更（currentCanonHash 不一致）→ pending 化して fan-out が member を再実行する。
- 全 member skipped の round で outcome が escalation となり、返却 state の reviewerStatuses で
  該当 member が pending のまま（skipped 確定していない）。
- 承認済み member の再承認で reviewerStatuses に新 approvedAtCommit と新 canonHash が記録される。
- managed（runtimeStrategy 不注入 / baselineCommit null）で既存の承認 skip 挙動が不変。

## T-06: 純粋関数・除外の unit テストを追加/更新する

- [x] `src/core/pipeline/__tests__/reviewer-status.test.ts` の
      `aggregateVerdict(["skipped","skipped"])` 期待を escalation に更新。
      `[]` → approved、`["approved","skipped"]` → approved のケースは維持/追加。
- [x] `selectPendingMembers` の canon 束縛ケースを追加する（design.md 「テスト影響」の polarity 表を固定）:
      revision 一致 + canon 一致 → skip、canon 不一致 → pending、legacy record（canonHash 欠落）→ pending、
      currentCanonHash=null → pending、currentCanonHash=undefined → skip（3-arg 保存）。
- [x] `applyRoundResults` の canonHash 記録ケースを追加する。
- [x] `computeCanonHash` の unit テストを追加する（空 / 全 null / 内容差 / 順不同同一）。
- [x] `src/core/pipeline/__tests__/round-git-scope.test.ts` を
      `excludePipelineManagedChangePaths` へ追随し、正典文書（design.md / request.md 等）が
      **保持** されるケースと、pipeline 出力が除外される既存ケースを両方固定する。

**Acceptance Criteria**:
- 受け入れ基準「canonHash を持たない legacy 承認 record が pending に戻る」を unit で固定。
- 受け入れ基準「reviewer 構成ありで全 member skipped → escalation、member 0 → approved」を unit で固定。
- 正典文書が touched に現れ、pipeline 出力が除外されることを unit で固定。

## T-07: reviewer-activation-e2e の期待を更新する（要件 3 の blast radius）

- [x] `tests/reviewer-activation-e2e.test.ts` の単一 reviewer skip 構成の `result.status` 期待を
      `"awaiting-archive"` から `"awaiting-resume"`（全 skip escalation）へ更新する:
      TC-ACT-01 / TC-ACT-02「requestTypes 不一致で skip」/ TC-ACT-04 第 1 テスト。
      member verdict "skipped" / skipReason の assertion は維持する。
- [x] TC-ACT-04 第 2 テスト（skipped + approved 混在）/ TC-ACT-02 一致ケース / TC-ACT-03 / TC-ACT-05 は
      変更しない（approved 合流のまま awaiting-archive）。
- [x] `tests/custom-reviewers-e2e.test.ts` の既存ケース（reviewer が approved / needs-fix を返す）が
      全 skip escalation の影響を受けないことを確認する（無変更で green）。TC-050 / TC-051 の
      承認 skip / invalidation 挙動が canon 束縛追加後も維持されることを確認する。

**Acceptance Criteria**:
- 単一 activation-不一致 reviewer の job が escalation（awaiting-resume）で停止することを固定。
- 混在（少なくとも 1 approved）の job は従来どおり完走することを固定。

## T-08: E2E（fabricated state + 実 git）で canon 束縛の一連を固定する

- [x] 実 git の temp repo を用意し、初期 commit に `specrunner/changes/<slug>/` 直下の正典文書
      （request.md / spec.md / design.md / tasks.md）と src ファイルを含める。branch を切る。
- [x] 実 `LocalRuntime`（実 spawnFn）と、approved を返す fake `StepExecutor` を用いて
      `ParallelReviewRound.run` を駆動する（実 LLM 不使用）。
- [x] シナリオ A（再走 + 新束縛）: round1 で reviewer を承認 → status に canonHash H1 /
      approvedAtCommit C1 が記録される。design.md を変更して git commit（HEAD=C2, canon=H2）→
      承認済み state を fabricate して round2 を実行 → reviewer が pending に戻って再走 → 新 status に
      canonHash H2 / approvedAtCommit C2 が束縛される。
- [x] シナリオ B（挙動保存）: 正典・source いずれも不変の round2 → reviewer が skip され再走しない
      （fake executor が呼ばれない）。
- [x] シナリオ C（findings 保存）: round 間で `<name>-result-NNN.md` のみを commit（正典・source 不変）
      → reviewer が invalidation を受けず skip される。
- [x] シナリオ D（破壊確認）: canon 束縛を無効化した場合にシナリオ A の再走 assertion が fail し、
      旧 `excludeChangeFolderPaths`（全除外）に戻すと正典変更 surfacing が fail することをコメントで
      記録する（コード上の期待は修正後挙動で固定）。

**Acceptance Criteria**:
- 承認済み state → 正典変更 → 全依存 reviewer 再走 → 新承認が最終 revision と新 canonHash に束縛される
  一連が fabricated state + 実 git で green。
- 正典・activation 対象不変の resume で承認 skip が維持される。
- reviewer 自身の findings commit が invalidation を誘発しない（既存目的の保存）。

## T-09: 破壊確認の記録と検証ゲート

- [x] 各受け入れ基準に対応する「修正前挙動に戻すと該当テストが fail する」ことを、テストコメントまたは
      design.md「破壊確認」節への追記として記録する（canon 束縛除去 / 除外全戻し / 全 skip approved 戻し /
      legacy skip 戻し）。
- [x] `typecheck && test` を green にする。

**Acceptance Criteria**:
- 破壊確認が全受け入れ基準について記録されている。
- `bun run typecheck && bun run test`（または project の verification.commands）が green。
