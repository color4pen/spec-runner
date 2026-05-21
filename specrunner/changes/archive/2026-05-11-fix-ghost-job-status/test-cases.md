# Test Cases: fix-ghost-job-status

## Overview

Ghost job 防止のテストシナリオ。`CommandRunner.execute()` の pre-pipeline フェーズで失敗した場合に job status が `running` のまま残らないことを検証する。

---

## TC-CR-009: setupWorkspace 失敗時に job status が failed になる

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md TC-CR-009 / request.md 受け入れ基準

```
GIVEN: 有効な request.md と一致する job state（status="running"）が作成済み
  AND: setupWorkspace() が Error("worktree failed") を throw する設定
WHEN: CommandRunner.execute() を呼び出す
THEN: ディスクから読み込んだ state.status === "failed"
  AND: state.error.code === "WORKSPACE_SETUP_FAILED"
  AND: state.error.message === "worktree failed"
  AND: 戻り値（exit code）=== 1
```

---

## TC-CR-010: buildDeps 失敗時に job status が failed になる

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md Task 2 / design.md Affected Error Paths

```
GIVEN: 有効な request.md と一致する job state（status="running"）が作成済み
  AND: buildDeps() が Error("dep build error") を throw する設定
WHEN: CommandRunner.execute() を呼び出す
THEN: ディスクから読み込んだ state.status === "failed"
  AND: state.error.code === "INIT_FAILED"
  AND: state.error.message === "dep build error"
  AND: 戻り値（exit code）=== 1
```

---

## TC-CR-010b: registerCleanup 失敗時に job status が failed になる

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md Task 2 / design.md Affected Error Paths

```
GIVEN: 有効な request.md と一致する job state（status="running"）が作成済み
  AND: registerCleanup() が Error("cleanup registration failed") を throw する設定
WHEN: CommandRunner.execute() を呼び出す
THEN: ディスクから読み込んだ state.status === "failed"
  AND: state.error.code === "INIT_FAILED"
  AND: 戻り値（exit code）=== 1
```

---

## TC-CR-011: pipeline が throw かつ state が running のとき defensive guard が failed に遷移する

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md TC-CR-010 / design.md Task 3

```
GIVEN: 有効な request.md と一致する job state（status="running"）がディスクに存在する
  AND: createStandardPipeline が { run: () => rejects(Error("pipeline crash")) } を返す
  AND: pipeline safety net は状態を更新しない（state が "running" のまま）
WHEN: CommandRunner.execute() を呼び出す
THEN: ディスクから読み込んだ state.status === "failed"
  AND: state.error.code === "PIPELINE_UNHANDLED_ERROR"
  AND: state.error.message === "pipeline crash"
  AND: 戻り値（exit code）=== 1
```

---

## TC-CR-012: pipeline safety net 発動済み（awaiting-resume）のとき defensive guard は上書きしない

- **Category**: correctness
- **Priority**: must
- **Source**: tasks.md TC-CR-011 / design.md Impact on Existing Behavior

```
GIVEN: 有効な request.md と一致する job state（status="running"）がディスクに存在する
  AND: createStandardPipeline が run() 実行中にディスクの state を "awaiting-resume" に書き換えてから reject する
WHEN: CommandRunner.execute() を呼び出す
THEN: ディスクから読み込んだ state.status === "awaiting-resume"（"failed" に上書きされない）
  AND: 戻り値（exit code）=== 1
```

---

## TC-CR-013: preflight 失敗（base-branch 未指定）は job state を作成しない

- **Category**: correctness
- **Priority**: must
- **Source**: request.md 受け入れ基準 / design.md Clarification on Acceptance Criteria

```
GIVEN: base-branch が未指定の request.md
  AND: runPreflight() がバリデーションエラーを throw する
WHEN: run.ts の run() を呼び出す
THEN: job state ファイルが作成されない（store に対応エントリが存在しない）
  AND: 戻り値（exit code）=== 1
```

---

## TC-CR-014: request.md ファイルが存在しない場合は job state を作成しない

- **Category**: correctness
- **Priority**: must
- **Source**: request.md 要件 2

```
GIVEN: 指定パスに request.md が存在しない
WHEN: CommandRunner.execute() を呼び出す
THEN: job state ファイルが作成されない
  AND: 戻り値（exit code）=== 1
```

---

## TC-CR-015: 正常実行時に job status 遷移が意図通りである

- **Category**: correctness
- **Priority**: must
- **Source**: request.md 受け入れ基準「正常な pipeline 実行に影響しない」

```
GIVEN: 有効な request.md と正常動作するすべての依存コンポーネント
WHEN: CommandRunner.execute() を呼び出す
THEN: pipeline.run() が呼ばれる
  AND: setupWorkspace / buildDeps / registerCleanup のエラーパスを通らない
  AND: job state が "failed" に不正遷移しない
```

---

## TC-CR-016: setupWorkspace エラーメッセージがエラー出力に書き出される

- **Category**: correctness
- **Priority**: should
- **Source**: tasks.md Task 1 / design.md Error Info

```
GIVEN: setupWorkspace() が Error("worktree failed") を throw する設定
WHEN: CommandRunner.execute() を呼び出す
THEN: stderr に "Error: Failed to set up workspace: worktree failed" が出力される
  AND: state.status === "failed"
```

---

## TC-CR-017: buildDeps/registerCleanup エラーメッセージが stderr に出力される

- **Category**: correctness
- **Priority**: should
- **Source**: tasks.md Task 2

```
GIVEN: buildDeps() が Error("missing config") を throw する設定
WHEN: CommandRunner.execute() を呼び出す
THEN: stderr に "Error: missing config" が出力される
  AND: state.status === "failed"
```

---

## TC-CR-018: defensive guard 内の store.fail() 自体が throw しても元のエラーがマスクされない

- **Category**: correctness
- **Priority**: should
- **Source**: tasks.md Task 3 コメント "best-effort — don't mask original error"

```
GIVEN: pipeline が Error("original pipeline error") を throw する
  AND: store.load() が Error("storage unavailable") を throw する
WHEN: CommandRunner.execute() を呼び出す
THEN: outputPipelineThrowError が "original pipeline error" で呼ばれる
  AND: 戻り値（exit code）=== 1
  AND: storage エラーは呑み込まれ表面化しない
```

---

## TC-CR-019: specrunner status で ghost job が表示されない

- **Category**: correctness
- **Priority**: should
- **Source**: request.md 受け入れ基準「specrunner status で ghost job が表示されない」

```
GIVEN: setupWorkspace 失敗により job status が "failed" に遷移している
WHEN: specrunner status（または ps）コマンドを実行する
THEN: 該当 job が "running" として表示されない
  AND: "failed" ステータスで表示される
```

---

## TC-CR-020: typecheck / test が全 pass する

- **Category**: correctness
- **Priority**: must
- **Source**: request.md 受け入れ基準

```
GIVEN: fix-guard の変更を適用した状態のコードベース
WHEN: bun run typecheck を実行する
THEN: 型エラー 0 件

WHEN: bun run test を実行する
THEN: 全テスト pass、新規失敗なし
```
