# Test Cases: finish-phase1-commit-restore

## Summary

Phase 1 末尾の commit step (`commitArchive`) の復元に関するテストシナリオ。
対象: `commitArchive` 関数 (unit) + `runPhase1Archive` orchestrator (integration)。

---

## TC-01: staging あり → commit 成功

- **Category**: unit / commitArchive
- **Priority**: must
- **Source**: Task 2 / 受け入れ基準 (Phase 1 末尾 commit step の追加)

**GIVEN** spawn が `git diff --cached --quiet` に exit code 1 を返す (staging あり)
**AND** spawn が `git commit -m "chore: archive test-slug"` に exit code 0 を返す
**WHEN** `commitArchive({ slug: "test-slug", cwd, spawn })` を呼ぶ
**THEN** `{ ok: true, skipped: false }` が返る
**AND** spawn に渡された commit 引数に `"chore: archive test-slug"` が含まれる

---

## TC-02: staging なし → commit skip

- **Category**: unit / commitArchive
- **Priority**: must
- **Source**: Task 2 / 受け入れ基準 (idempotent)

**GIVEN** spawn が `git diff --cached --quiet` に exit code 0 を返す (staging なし)
**WHEN** `commitArchive({ slug: "test-slug", cwd, spawn })` を呼ぶ
**THEN** `{ ok: true, skipped: true }` が返る
**AND** `git commit` が一度も呼ばれない

---

## TC-03: git commit 失敗 → escalation

- **Category**: unit / commitArchive
- **Priority**: must
- **Source**: Task 2 / 受け入れ基準 (commit 失敗時は escalation)

**GIVEN** spawn が `git diff --cached --quiet` に exit code 1 を返す (staging あり)
**AND** spawn が `git commit` に exit code 1 を返す
**WHEN** `commitArchive({ slug: "test-slug", cwd, spawn })` を呼ぶ
**THEN** `{ ok: false }` が返る
**AND** `escalation` 文字列に `"commit-archive"` が含まれる

---

## TC-04: `git diff --cached --quiet` 異常 exit code → escalation

- **Category**: unit / commitArchive
- **Priority**: must
- **Source**: Task 2 / design D3 (exit 0/1 以外は git 自体の異常)

**GIVEN** spawn が `git diff --cached --quiet` に exit code 128 を返す
**WHEN** `commitArchive({ slug: "test-slug", cwd, spawn })` を呼ぶ
**THEN** `{ ok: false }` が返る
**AND** `git commit` が呼ばれない

---

## TC-05: commit message の形式検証

- **Category**: unit / commitArchive
- **Priority**: must
- **Source**: 受け入れ基準 (commit message は `chore: archive <slug>` 形式)

**GIVEN** spawn が staging あり (exit 1) → commit 成功 (exit 0) を返す
**WHEN** `commitArchive({ slug: "my-feature", cwd, spawn })` を呼ぶ
**THEN** spawn への commit 呼び出し引数が正確に `["commit", "-m", "chore: archive my-feature"]` である
**AND** slug が動的に展開されている (`"chore: archive my-feature"` が literal ではなく `slug` 変数から生成)

---

## TC-06: orchestrator Phase 1 正常系で commit step が呼ばれる

- **Category**: integration / orchestrator
- **Priority**: must
- **Source**: Task 4 / 受け入れ基準 (orchestrator.ts:runPhase1Archive で新関数が呼ばれている)

**GIVEN** TC-123 の happy-path セットアップ (spec-merge + archive 成功)
**WHEN** `runPhase1Archive` を実行する
**THEN** spawn 呼び出し履歴に `["git", ["diff", "--cached", "--quiet"]]` が存在する
**AND** spawn 呼び出し履歴に `["git", ["commit", "-m", "chore: archive <slug>"]]` が存在する
**AND** `git commit` の呼び出しが `git mv` / `git add` より後である

---

## TC-07: orchestrator Phase 1 正常系で Phase 2 に進む前に commit 消化

- **Category**: integration / orchestrator
- **Priority**: must
- **Source**: 受け入れ基準 (mergeSpecsForChange + archiveChangeFolder の staging を 1 commit にまとめる)

**GIVEN** happy-path セットアップ
**WHEN** `runPhase1Archive` が完了する
**THEN** commit 後の staging が空 (= `git diff --cached --quiet` exit 0) になる
**AND** Phase 2 push が staging を含まない状態で開始される

---

## TC-08: orchestrator Phase 1 で commit 失敗 → Phase 2 に進まない

- **Category**: integration / orchestrator
- **Priority**: must
- **Source**: 受け入れ基準 (commit 失敗時は escalation を返し Phase 2 push に進まない)

**GIVEN** spec-merge + archive が成功し staging あり
**AND** `git commit` が exit code 1 を返す
**WHEN** `runPhase1Archive` を実行する
**THEN** `{ ok: false, escalation: ..., exitCode: 1 }` が返る
**AND** Phase 2 (push) に関する spawn 呼び出しが発生しない

---

## TC-09: orchestrator で archive folder 不在 (skip) でも `git diff --cached --quiet` が呼ばれる

- **Category**: integration / orchestrator
- **Priority**: should
- **Source**: Task 4 / TC-103 対応

**GIVEN** spec-merge skip + archive skip のセットアップ (TC-103 相当)
**WHEN** `runPhase1Archive` を実行する
**THEN** spawn 呼び出し履歴に `["git", ["diff", "--cached", "--quiet"]]` が存在する
**AND** `git diff --cached --quiet` が exit 0 (staging なし) を返す
**AND** `git commit` が呼ばれない

---

## TC-10: delta spec に Phase 1 commit step の Requirement が存在する

- **Category**: spec / cli-finish-command
- **Priority**: must
- **Source**: Task 5 / 受け入れ基準 (delta spec に Requirement 新規追加)

**GIVEN** `specrunner/changes/finish-phase1-commit-restore/specs/cli-finish-command/delta.md` が存在する
**WHEN** ファイルを読む
**THEN** 「Phase 1 末尾で staging が存在する場合、`git commit -m "chore: archive <slug>"` を実行する」に相当する Requirement が含まれる
**AND** 「staging が存在しない場合は commit を skip する (idempotent)」に相当する Requirement が含まれる

---

## TC-11: `commitArchive` は fs に依存しない

- **Category**: unit / commitArchive
- **Priority**: should
- **Source**: design D2 (params は `{ slug, cwd, spawn }` の最小構成)

**GIVEN** `commitArchive` の実装
**WHEN** 関数シグネチャと import を確認する
**THEN** `FinishFs` 型への依存が存在しない
**AND** import は `SpawnFn` と `formatEscalation` のみである

---

## TC-12: `bun run typecheck && bun run test` が green

- **Category**: build / typecheck
- **Priority**: must
- **Source**: Task 6 / 受け入れ基準

**GIVEN** 全 Task (1–5) の実装が完了している
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** exit code 0 で完了する
**AND** 型エラーが 0 件
**AND** テスト失敗が 0 件
