# Cross-Boundary Invariants Review — staging-containment-followups — iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `git diff main...HEAD --stat`：変更スコープ確認（実装 4 ファイル + テスト 4 ファイル + docs 1 ファイル + change folder）
- `src/core/step/commit-push.ts`：byte guard 挿入位置・guarded/scoped 分岐構造・cwd 変数の由来・reset --mixed の実行順序・commitMutex chain の動作を精読
- `src/core/step/staging-containment.ts`：`measureStagedBytes` の `for...of` 逐次処理・非 ENOENT rethrow・`summarizeTopDirectoriesBySize` の 0 バイトエントリ処理を確認
- `src/errors.ts`：`STAGED_BYTES_LIMIT_EXCEEDED` が `EXIT_CODE_MAP` に不在であること、`makeCommitFailHalt` 経由の escalation path を確認
- `src/core/step/executor.ts:102`：`commitPushInfra` 構築が `statFn` を含まず optional で問題ないことを確認
- `src/core/step/step-halt.ts`：`makeCommitFailHalt` が `err.code` を保存し、STAGED_BYTES_LIMIT_EXCEEDED が正しく伝播することを確認
- `src/core/step/commit-push.ts:commitFinalState`：byte guard が `commitFinalState` に影響しないことを確認（別関数・別 staging logic）
- `getWorktreeChangedPaths` のパース処理：`worktreeOnly=false` 時に staged-only エントリ（X≠' ', Y=' '）が `paths` に含まれることを確認し、byte guard との相互作用を分析
- `src/prompts/fragments.ts`：`COMMIT_DISCIPLINE` への追記が additive のみ（既存 git 禁止ルールを破壊しない）であることを確認
- `COMMIT_DISCIPLINE` の利用箇所：implementer / build-fixer / code-fixer / test-materialize / spec-fixer / adr-gen の全 6 producer に継承されることを grep で確認
- `src/core/step/__tests__/commit-push-guarded-staging.test.ts`：既存テストが `statFn` を設定しない場合の挙動（fake cwd → ENOENT → 0 bytes → no byte halt）を確認
- `docs/configuration.md` diff："Both settings" → "All three settings" への更新と `maxStagedBytes` 行の追加を確認

## 検証できなかった項目

None

---

## Findings 詳細

### F-001 — staged-only エントリ（pre-staged, Y=' '）の byte 計上は不変条件ではなく意図的 [informational]

**Location**: `src/core/step/commit-push.ts` guarded branch

`getWorktreeChangedPaths` は `worktreeOnly=false` で呼ばれるため、`paths` には staged-only ファイル（X≠' ', Y=' '）も含まれる。これらは `stagePaths` に入り、`measureStagedBytes` が `lstat` でサイズを測定する。

- `D ` (staged deletion): worktree に不在 → `lstat` が ENOENT → 0 bytes ✓
- `M ` (staged modification, worktree clean): worktree にファイルが存在 → `lstat` がサイズを返す → 正しく計上される
- `A ` (staged-new): worktree にファイルが存在 → 同上

この挙動は file-count guard（既存）と完全に対称であり、既存の不変条件を破っていない。guarded branch の `git add -A -- <stagePaths>` も同じ `stagePaths` を使うため、byte 測定対象 = add 対象は一致している。

ただし、guarded step 開始前に agent が自己 commit していない場合（no reset）で、かつ pipeline 外から大量ファイルを pre-stage した場合、byte guard が誤発火するシナリオは理論上存在する。しかしこれは file-count guard でも同様の挙動であり、新たな不変条件の破壊ではない。

**影響**: なし（informational のみ）

---

### F-002 — `COMMIT_DISCIPLINE` が scoped step（spec-fixer）にも伝播するが byte guard はカバーしない [informational]

**Location**: `src/prompts/fragments.ts`、`src/prompts/spec-fixer-system.ts`

`spec-fixer` は SCOPED step であり、`commitAndPush` の scoped 分岐を使う。byte guard は guarded 分岐にのみ存在するため、`spec-fixer` の出力に対しては byte guard の歯がない。

新しい hygiene 規律（「build 出力を tracked 場所へ出力しない」）が `spec-fixer` の system prompt に入ることは、request の設計判断（shared fragment 1 箇所編集）の帰結であり、design.md の Risk セクションで "intended and harmless" と明記されている。`spec-fixer` は spec.md のみ書くため、実質的に inert である。

これは既存の scoped 分岐の不変条件（declared outputs のみ staging）を破らない。scoped 分岐は `step.writes()` で宣言されたパス以外を stage しない機構を持つため、prompt が余分なファイルを書いても guarded 分岐と異なり byte guard は発火しない（そもそも scoped 分岐が余分なファイルを commit しない）。

**影響**: なし（informational のみ）

---

## 不変条件チェックリスト

### I-1: guarded git コール列に変更なし

`status → [lstat: 非 git] → add → diff --cached → commit → rev-parse → rev-list → push`

byte guard は `lstat` のみで、git コールを追加しない。✅

### I-2: scoped 分岐が完全に未変更

`if (mode === "scoped") { ... }` ブロックは diff に現れない。byte guard は `else`（guarded）ブロック内のみ。✅

### I-3: file-count guard の判定点・既定値・エラーコード・メッセージが不変

`resolveMaxStagedFiles`・`stagingLimitExceededError`・`if (stagePaths.length > limit)` はいずれも diff に現れない。byte guard はその直後に追加。✅

### I-4: EXIT_CODE_MAP 不変条件

`STAGED_BYTES_LIMIT_EXCEEDED` は `EXIT_CODE_MAP`（`errors.ts:19-31`）に存在しない。`STAGING_LIMIT_EXCEEDED` と同じ escalation path（`makeCommitFailHalt` 経由、pipeline escalation）。✅

### I-5: synthesizedCommits 台帳の一貫性

byte guard は `git add` の前に halt する。`persistBeforePush` および `appendOidInPlace` はいずれも `git commit` 後にのみ呼ばれるため、byte halt 時には実行されない。台帳は汚染されない。✅

### I-6: commitMutex チェーンの継続性

`executor.ts` は `finalizeStepArtifacts` の例外を内部 `.catch` で吸収し、`commitMutex` を resolved promise に更新する。byte guard の throw はこの経路を通り、次の commit 操作をブロックしない。✅

### I-7: commitFinalState への非影響

`commitFinalState` は `commitAndPush` とは独立した関数で、独自の staging logic を持つ。byte guard はここに挿入されていない。✅

### I-8: 既存テストの green 保証

既存テスト（`commit-push-guarded-staging.test.ts`）は `statFn` を設定しない。`defaultStagedPathSizeProbe`（`fs.lstat`）は fake cwd（`/tmp/fake-repo-guarded-staging-test`）配下の存在しないパスに対して ENOENT を返す → 全パス 0 bytes → 合計 0 < 52,428,800 → byte guard 不発火。既存テストは無改変で green のまま。✅

### I-9: executor.ts:102 コンパイル非破壊

`statFn` は `CommitPushInfra` の optional フィールド。`executor.ts:102` の `{ spawnFn, sleepFn, events }` 構築はそのまま型チェックを通る。✅

### I-10: lstat vs stat（symlink 安全性）

`defaultStagedPathSizeProbe` が `fsLstat` を使う（`stat` ではない）。symlink はリンクエントリ自体のサイズで計測される。git pack も symlink エントリをパックするため、この計測は正確。✅

### I-11: 非 ENOENT 計測エラーの fail-closed 伝播

`measureStagedBytes` は非 ENOENT エラーを rethrow する。`commit-push.ts` はこれを `commitEffectFailedError("stage", ...)` でラップ（code: `COMMIT_AND_PUSH_FAILED`）。fail-open にはならない。✅

### I-12: COMMIT_DISCIPLINE の git 禁止ルール保持

既存の `git add` / `git commit` / `git push` 禁止テキストは fragments.ts の diff で削除されていない。新規 artifact hygiene 節が末尾に追加されるのみ。既存の `coverage-gate-prohibition.test.ts` も `COMMIT_DISCIPLINE` のテキストを直接 assert しないため影響なし。✅

---

## 受け入れ基準との照合

- [x] file 数閾値以下 × バイト閾値超過で git add / commit / push が不実行 halt（TC-030 破壊確認込み）
- [x] バイト閾値以下は従来どおり commit + push（TC-031）
- [x] 削除予定 path が 0 バイト扱いで誤発火しない（TC-032）
- [x] halt メッセージに総バイト数・閾値・サイズ内訳・対処が含まれる（TC-034 / TC-042）
- [x] maxStagedBytes schema validation（正の整数のみ許容）（TC-038 / TC-039）
- [x] COMMIT_DISCIPLINE の生成物衛生規律文言存在（TC-040）
- [x] 既存テスト（TC-001〜TC-020 含む）無変更 green（検証: ENOENT → 0 bytes 経路の invariant 解析）
- [x] typecheck && test が green（verification-result.md: 10220 passed）

## Non-Goal 適合確認

- push 経路（pushOnly）に変更なし ✅
- scoped 分岐に guard 追加なし ✅
- maxStagedFiles / stagingExcludePatterns の挙動変更なし ✅
- runtime dependency 追加なし ✅
- .specrunner/config.json 変更なし ✅
- 既存テストファイルへの変更なし ✅
