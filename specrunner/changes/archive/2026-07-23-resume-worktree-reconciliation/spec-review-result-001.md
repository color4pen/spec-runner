# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 1. request.md 要件 → spec.md の対応確認

| 要件 | spec.md の対応箇所 | 判定 |
|---|---|---|
| R1: resume が step 開始前に worktree を reconcile し一貫した開始状態を確立 | "resume mechanically reconciles the worktree before starting the step" | ✅ |
| R2: 3クラス分類（protected canon / pipeline 管理成果物 / 非管理パス）× 処理 | spec.md の 3クラス要件 + Scenarios 4本 | ✅ |
| R3: 除去は必ず退避を伴う、退避失敗時は fail-closed | "reconcile is fail-closed when evidence cannot be preserved" Scenario | ✅ |
| R4: 残骸が次 step の write-set 検査で誤帰属される経路を閉じる | Scenario TC-R1 が `findScopedCommitViolations` / `findWriteScopeViolations` で封鎖を確認する設計 | ✅ |
| R5: 全 resume 経路で reconcile が実行される（default / --from / --apply-canon） | spec.md: "No path shall skip reconcile" + tasks.md T-02 TC-I1/I2/I3 | ✅ |
| R6: 回復契約を docs に 1 ページで明文化 | T-03: `docs/operations.md` の `## 障害への耐性` 配下へのサブセクション追加 | ✅ |

### 2. 設計判断の検証

**D1 (resume を単一回復点とする)**: crash / kill での halt 側 cleanup 不保証を根拠に resume 側に置く判断を確認。`prepare()` が全停止態様の合流点であることを `src/core/command/resume.ts:270` の worktree guard ブロックで確認。

**D2 (新モジュール `src/core/resume/reconcile-worktree.ts`)**: 同一 layer (core/resume) 内への配置。`core/resume/resolve-step.ts` が `../pipeline/types.js` を参照しており、新モジュールが `../pipeline/round-git-scope.js` を参照するのも同層 import として問題なし。

**D3 (state journal を reconcile しない)**: `pipelineManagedPaths(slug)` = `[state.json, events.jsonl, usage.json, bite-evidence-result.md, pr-create-result.md]` を `src/core/pipeline/round-git-scope.ts:109` で確認。この 5 パスは reconcilable クラスから除外されるため state journal は保護される。

**D4 (quarantine-all-then-remove-all)**: 「全証拠保全後に削除開始」の不変条件を確認。途中の quarantine 失敗は throw → 削除ゼロ、という fail-closed 保証が evidence loss を防ぐ設計として適切。

**D5 (removal 種別分岐)**: `src/core/step/commit-push.ts` の `restoreViolatedPaths` が同一 3 種別（untracked→clean / staged-new→rm-cached+clean / tracked→checkout）でパターン確立済みであることを確認。reconcile が同パターンを踏襲することで実装の整合を保てる。

**D6 (apply-canon gate の後)**: `resume.ts:270` の worktree guard ブロック構造を確認。reconcile は `if (resolvedWorktreePath !== null && resolvedSlug !== null)` ブロック内で、既存の canon gate（`dirtyCanonPaths.length > 0` 分岐）の後、`return` の前に配置される。apply-canon fail-closed が先に throw するため、reconcile は dirty canon では到達しない。順序の論理整合を確認。

**D7 (detection は best-effort、quarantine/removal は fail-closed)**: `git status` spawn 失敗・非ゼロ終了時の no-op 返却と、quarantine/removal 失敗時の throw の非対称が意図的な設計であることを確認。既存 apply-canon テストが fake worktree パスを使い `git status` が実行できない環境で動作する点（D7 が "no-op = pre-feature 挙動" に倒す理由）との整合を確認。

### 3. コードアサーション検証

- `src/core/command/resume.ts:268-328`: apply-canon gate は `detectCanonDirtyPaths` が `protectedCanonPaths(slug)` にスコープ限定。非 canon dirty は無検査で通過することを読了確認。
- `src/core/resume/apply-canon.ts:50`: `git status --porcelain -z --no-renames -- <protectedCanonPaths>` の pathspec を確認。
- `src/core/step/commit-push.ts:92-96 / 140-142`: `worktreeOnly=true` でも untracked (`Y='?'`) は除外されず `paths` に乗ることを確認。残骸→halt 再生産の経路が実コードで閉じていることを確認。
- `src/core/pipeline/round-git-scope.ts:109` (`pipelineManagedPaths`): 5 パス返却を確認。`*-result-*.md` 系はこの集合に含まれないため、step artifact が residue になると `findScopedCommitViolations` でバイオレーション判定されることを確認。
- `src/core/step/write-scope.ts:165-173` (`findScopedCommitViolations`): `changedPaths − (declared ∪ managed)` の実装を確認。post-reconcile で残骸がなければ返却値が `[]` になることを机上検証。
- `src/util/paths.ts` (`changeFolderPath`, `localSidecarDir`): reconcile の分類述語・退避先パスの関数が存在することを確認。

### 4. テスト設計の検証

- **T-04 (unit)**: pure classifier の TC-U1〜U5 で same-prefix-different-dir ガード (`slug-other/`) を含む境界ケースを網羅。TC-U6/U7 で orchestrator の no-op・best-effort 検出を単体カバー。
- **T-05 (real git)**: TC-R1 が `findScopedCommitViolations` / `findWriteScopeViolations` を実際の関数で呼び、"残骸が消えると halt が消える" 封鎖を実証する設計。TC-R2 の quarantine 失敗（ファイルとして事前作成）が fail-closed を実ファイルシステムで検証。
- **T-06 (wiring)**: TC-I1〜I6 がすべての resume 経路 × reconcile 呼び出し有無を mock で確認。TC-I7 が destruction confirmation として残骸が存在すると halt が再生産されることを文書化。
- **T-07 (docs drift guard)**: 3クラス名と `.specrunner/local/` を docs から削除できないよう機械的な歯を付ける設計を確認。
- **T-08**: D7 により既存の apply-canon テストが fake worktree で no-op となり無変更 green になる理由を確認。

### 5. セキュリティ検証

- **コマンドインジェクション**: `runSubprocess` / `gitExecResult` が `spawnFn(bin, args[], opts)` の配列引数で呼ばれるため、shell 展開なし。`git status` 出力の `filePath` が `git clean` / `git rm` / `git checkout` に array 要素として渡されるため注入面なし。
- **パストラバーサル**: `isReconcilableArtifact` が `path.startsWith(changeFolderPath(slug) + "/")` を検査し、change folder 外のパスを排除。`git status --porcelain` 出力はワークツリー相対パス（`../` なし）のため、実用上の traversal リスクなし。
- **証拠ファイル名のサニタイズ**: quarantine evidence ファイル名は `/` → `__` 変換でサブディレクトリ分割を防止（T-01 要件）。

## 検証できなかった項目

None — コードアサーション全点読了、障害経路の机上検証完了、セキュリティ観点も確認済み。

## Findings 詳細

### OBS-01: `rules.md` は暗黙的に reconcilable クラスに分類される（観察）

`specrunner/changes/<slug>/rules.md`（`rulesDestPath(slug)`）は:
- `protectedCanonPaths(slug)` に含まれない
- `pipelineManagedPaths(slug)` に含まれない
- `changeFolderPath(slug)` 配下

のため、dirty/untracked になれば reconcile 対象になる。これは "pipeline が生成したコピーファイル" として正しい動作だが、spec.md/design.md には明示的な言及がない。operator が `rules.md` を直接編集して resume した場合は reconcile により証拠保全のうえ除去される。実運用上は `specrunner/rules/<step>/*.md` 側で編集するべき設計のため影響は軽微。

### OBS-02: T-02 配置の説明表現（観察）

T-02 は「apply-canon gate logic の後、`else if (this.options.applyCanon)` branch の前」と表現しているが、`else if` ブランチは `if (resolvedWorktreePath !== null && resolvedSlug !== null)` ブロックの外側（同レベルの else if）であり、reconcile は `if` ブロック内に入る。design.md D6 の「apply-canon gate の後、prepare() returns の前」の表現の方が正確。実装者が `resume.ts` を読めば構造は自明だが、tasks.md の文言に若干の曖昧さがある。
