# Conformance Result — resume-partial-canon-quarantine — iter 1

<!-- verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。 -->

## 検証した項目

| カテゴリ | 確認数 | スキップ | 未確認 |
|---------|--------|---------|--------|
| request.md 受け入れ基準 | 9 | 0 | 0 |
| spec.md SHALL 要件 | 7 | 0 | 0 |
| design.md 設計判断（D1–D5） | 5 | 0 | 0 |
| tasks.md チェックボックス（T-01–T-07） | 7 | 0 | 0 |
| テストケース（TC-001–TC-028） | 28 | 0 | 0 |
| `typecheck && test` ゲート | 1 | 0 | 0 |

**スコープ**: 新規実装ファイル + テスト全体。既存 reconcile/apply-canon テストの
後方互換性も確認（736 files 全 green）。

---

## J1: spec.md SHALL 要件 vs 実装

### SHALL: 4 条件完全一致時のみ halt せず自動隔離して続行

- `isInterruptedStepPartialCanon`（canon-provenance.ts）が 4 条件 AND を実装。✓
- resume.ts apply-canon gate が三分岐（applyCanon / auto-quarantine / fail-closed）。✓
- 条件 1（startStep === interruptedStep）は gate 側で独立チェック。✓
- 条件 2（writes() 宣言一致）は `declaredCanonWritesForStep` で step registry を実測参照。✓
- 条件 3（interruption backing）は `isInterruptionBacked` で signal/stale/timeout/failure/exhaustion を判定。✓
- 条件 4（完了 StepRun 不在）は `!(state.steps?.[interruptedStep]?.length)` で判定（元 state 使用）。✓
- テスト: TC-001, TC-002, TC-003, TC-018

### SHALL: evidence を全件退避してから削除。退避先・対象を log に明示

- `quarantineAndRemoveMatching` が evidence-first を実装（削除前に fsWriteFile 全件成功必須）。✓
- prefix `canon-quarantine-` で退避ディレクトリを識別（`reconcile-` と区別）。✓
- 成功時 `logInfo` で step 名・退避 paths・quarantineDir を出力。✓
- テスト: TC-003（配線レベル）, TC-023（e2e: untracked/tracked-modified で evidence 可読確認）

### SHALL: 4 条件のうち 1 つでも不成立なら fail-closed halt

- 条件 2/3/4 の各単一欠落で `isInterruptedStepPartialCanon` が false → halt。✓
- 条件 1 不成立（--from redirect）で gate の else ブロックが halt。✓
- テスト: TC-004〜TC-006（配線レベル）, TC-019〜TC-022（pure helper 単体）, TC-027

### SHALL: `--apply-canon` 明示は自動隔離より優先

- `if (this.options.applyCanon)` が else-if（auto-quarantine）より先に評価。✓
- テスト: TC-007

### SHALL: evidence 書き込み失敗時は削除せず fail-closed halt

- `quarantineAndRemoveMatching` の fsWriteFile throw がそのまま伝播し、削除フェーズに到達しない。✓
- テスト: TC-008（mock）, TC-024（e2e: `.specrunner/local` を FILE として配置し mkdir を封鎖）

### SHALL: stale-running 検出を裏づけとして部分出力判定を適用

- resume.ts line 164 で `staleRunningDetected = isStaleRunning(state, sidecarPath)` を
  状態遷移前に確定し、apply-canon gate の `isInterruptionBacked` に渡す。✓
- テスト: TC-009

### SHALL: 自動隔離後の再 resume は apply-canon gate を dirty 検出なしで通過

- 隔離が worktree から canon を除去した後、`detectCanonDirtyPaths` は `[]` を返す。✓
- テスト: TC-010, TC-023（e2e idempotency）

---

## J2: design.md 設計判断 vs 実装

| 判断 | 内容 | 確認 |
|------|------|------|
| D1 | apply-canon gate 内三分岐。canon は gate が排他的に処理。 | ✓ |
| D2 | 4 条件 AND。条件 1 は gate 側、条件 2/3/4 は pure helper に集約。 | ✓ |
| D3 | `quarantineAndRemoveMatching` 内部関数に core を集約。`reconcileWorktreeArtifacts` 外部シグネチャ不変。 | ✓ |
| D4 | quarantine 成功後は throw せず続行。startStep は中断 step のまま再走。 | ✓ |
| D5 | `applyCanon` チェックが else-if（auto-quarantine）より前。 | ✓ |

---

## J3: tasks.md チェックボックス

全タスク（T-01〜T-07）が `[x]` 完了。

| タスク | 主要成果物 |
|--------|-----------|
| T-01 | `quarantineAndRemoveMatching` 切り出し + `quarantinePartialCanon` 新規 export |
| T-02 | `canon-provenance.ts` に 3 pure helper + apply-canon.ts で re-export |
| T-03 | resume.ts 三分岐配線 + `staleRunningDetected` 導入 + logInfo |
| T-04 | `apply-canon-provenance.test.ts` TC-011〜TC-022 |
| T-05 | `resume-partial-canon.test.ts` TC-001〜TC-010, TC-027 |
| T-06 | `resume-partial-canon-quarantine-e2e.test.ts` TC-023〜TC-026 |
| T-07 | `typecheck && test` green |

---

## J4: typecheck && test ゲート

```
bun run typecheck: exit 0 (tsc --noEmit エラー無し)
bun run test:     736 files passed / 10963 tests passed / 1 skipped (exit 0)
```

---

## 検証できなかった項目

None。

---

## Findings 詳細

### [低] TC-009 テストセットアップの production 再現精度（非ブロッキング）

TC-009（stale-running 経路）では state を `awaiting-resume` で初期化し、`isStaleRunning` を
mock で `true` に設定している。production では `isStaleRunning` は `status === "running"` の
state にのみ `true` を返し、同一 prepare() 呼び出し内で `awaiting-resume` へ遷移する。

テストは gate ロジック（`staleRunningDetected=true` → quarantine 発動）を正しく検証しているが、
production フロー（running → stale 遷移 → gate）を正確に再現していない。gate の正しさは
TC-009 で確認済みであり、stale 検出ロジック自体は既存の `resume-hard-crash.test.ts` で
別途保証されているため、conformance への影響なし。

### [低] `minimalDeps` の型強制（既知天井）

resume.ts で `{ slug, request, config } as StepDeps` と型強制して `declaredCanonWritesForStep`
に渡す。現在の `DesignStep.writes()` は `slug` と `request.type` のみ参照するため runtime 問題はない。
design.md に「将来 writes() が追加フィールドを参照した場合は minimalDeps の構築を同期すること」と
記載されており、既知の天井として文書化済み。conformance への影響なし。
