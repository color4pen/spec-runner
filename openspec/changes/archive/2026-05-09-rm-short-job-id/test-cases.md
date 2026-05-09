# Test Cases: rm コマンドで短縮 Job ID を受け付ける

## Overview

本ドキュメントは `rm-short-job-id` の実装検証に使用するテストシナリオを定義する。
ソースは `tasks.md` の各タスクと `design.md` の設計判断（D1〜D5）。

---

## TC-01: resolveJobId — 完全 UUID pass-through

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md 5.2, design.md D2

**GIVEN** `resolveJobId` に 36 文字の UUID v4 形式文字列（例: `3f1a1f29-0669-482a-b2d4-0f272e1caaf3`）を渡す  
**WHEN** 関数を呼び出す  
**THEN** `listJobStates()` を呼ばずに入力をそのまま返す

---

## TC-02: resolveJobId — 短縮 ID で 1 件 match

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md 5.3

**GIVEN** ジョブストアに `3f1a1f29-0669-482a-b2d4-0f272e1caaf3` が存在する  
**WHEN** `resolveJobId("3f1a1f29")` を呼び出す  
**THEN** 完全 UUID `3f1a1f29-0669-482a-b2d4-0f272e1caaf3` を返す

---

## TC-03: resolveJobId — 短縮 ID で 0 件 match

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md 5.4

**GIVEN** ジョブストアにどのジョブも `deadbeef` で始まらない  
**WHEN** `resolveJobId("deadbeef")` を呼び出す  
**THEN** `JOB_NOT_FOUND` エラーコードで `SpecRunnerError` を throw する

---

## TC-04: resolveJobId — 短縮 ID で 2 件以上 match

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md 5.5, design.md D3

**GIVEN** ジョブストアに `aaaabbbb-0001-...` と `aaaabbbb-0002-...` の 2 件が存在する  
**WHEN** `resolveJobId("aaaabbbb")` を呼び出す  
**THEN** `AMBIGUOUS_JOB_ID` エラーコードで `SpecRunnerError` を throw し、`hint` に両 UUID の一覧を含める

---

## TC-05: resolveJobId — 1 文字 prefix で一意に特定

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md 5.6, design.md Non-Goals（最小長制限なし）

**GIVEN** ジョブストアに `a` で始まるジョブが 1 件だけ存在する  
**WHEN** `resolveJobId("a")` を呼び出す  
**THEN** そのジョブの完全 UUID を返す

---

## TC-06: AMBIGUOUS_JOB_ID エラーコードの存在確認

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md 1.1

**GIVEN** `src/errors.ts` の `ERROR_CODES`  
**WHEN** `ERROR_CODES.AMBIGUOUS_JOB_ID` を参照する  
**THEN** 文字列 `"AMBIGUOUS_JOB_ID"` が返る

---

## TC-07: ambiguousJobIdError ヘルパーの出力形式

- **Category**: unit
- **Priority**: must
- **Source**: tasks.md 1.2, design.md D3

**GIVEN** prefix `"3f1a"` と候補 UUID リスト 2 件  
**WHEN** `ambiguousJobIdError("3f1a", [uuid1, uuid2])` を呼び出す  
**THEN** `code === "AMBIGUOUS_JOB_ID"` かつ `hint` に各候補 UUID を含む `SpecRunnerError` を返す

---

## TC-08: rm — 8 文字短縮 ID で一意なジョブを削除

- **Category**: integration
- **Priority**: must
- **Source**: tasks.md 3.1, 受け入れ基準

**GIVEN** ジョブ `3f1a1f29-0669-482a-b2d4-0f272e1caaf3` が存在する  
**WHEN** `specrunner rm 3f1a1f29` を実行する  
**THEN** exit code 0 でジョブが削除される

---

## TC-09: rm — 完全 UUID での削除が従来通り動作

- **Category**: integration
- **Priority**: must
- **Source**: 受け入れ基準（後方互換性）

**GIVEN** ジョブ `3f1a1f29-0669-482a-b2d4-0f272e1caaf3` が存在する  
**WHEN** `specrunner rm 3f1a1f29-0669-482a-b2d4-0f272e1caaf3` を実行する  
**THEN** exit code 0 でジョブが削除される（既存動作の regression なし）

---

## TC-10: rm — 曖昧な短縮 ID でエラーメッセージに候補を表示

- **Category**: integration
- **Priority**: must
- **Source**: tasks.md 3.2, 受け入れ基準

**GIVEN** `aaaa` で始まるジョブが 2 件存在する  
**WHEN** `specrunner rm aaaa` を実行する  
**THEN** exit code 1、stderr に `AMBIGUOUS_JOB_ID` エラーと候補 UUID 一覧を出力する

---

## TC-11: rm — 存在しない短縮 ID でエラー

- **Category**: integration
- **Priority**: must
- **Source**: tasks.md 3.2

**GIVEN** `deadbeef` で始まるジョブが存在しない  
**WHEN** `specrunner rm deadbeef` を実行する  
**THEN** exit code 1、stderr に `JOB_NOT_FOUND` エラーを出力する

---

## TC-12: rm --all-terminated は変更なし

- **Category**: integration
- **Priority**: should
- **Source**: design.md D5

**GIVEN** terminated 状態のジョブが複数存在する  
**WHEN** `specrunner rm --all-terminated` を実行する  
**THEN** `resolveJobId` を経由せず既存フローで全件削除される（regression なし）

---

## TC-13: resume — 短縮 Job ID でジョブを再開

- **Category**: integration
- **Priority**: must
- **Source**: tasks.md 4.1, 4.2, 受け入れ基準

**GIVEN** slug `my-feature` が存在せず、ジョブ `3f1a1f29-0669-482a-b2d4-0f272e1caaf3` が存在する  
**WHEN** `specrunner resume 3f1a1f29` を実行する  
**THEN** slug 解決失敗後 `resolveJobId("3f1a1f29")` にフォールバックし、正しいジョブで resume を続行する

---

## TC-14: resume — slug が存在する場合は slug 優先

- **Category**: integration
- **Priority**: must
- **Source**: design.md D4（既存動作を壊さない）

**GIVEN** slug `my-feature` に対応するジョブが存在する  
**WHEN** `specrunner resume my-feature` を実行する  
**THEN** slug 解決で完結し、`resolveJobId` を呼ばずに resume する

---

## TC-15: resume — 曖昧な短縮 ID でエラー

- **Category**: integration
- **Priority**: must
- **Source**: tasks.md 4.3, 受け入れ基準

**GIVEN** `aaaa` で始まるジョブが 2 件存在し、slug `aaaa` も存在しない  
**WHEN** `specrunner resume aaaa` を実行する  
**THEN** exit code 1、stderr に `AMBIGUOUS_JOB_ID` エラーと候補 UUID 一覧を出力する

---

## TC-16: resume — 存在しない短縮 ID でエラー

- **Category**: integration
- **Priority**: should
- **Source**: tasks.md 4.3

**GIVEN** `deadbeef` で始まるジョブが存在せず、slug `deadbeef` も存在しない  
**WHEN** `specrunner resume deadbeef` を実行する  
**THEN** exit code 1、stderr にエラーを出力する

---

## TC-17: typecheck & test が green

- **Category**: verification
- **Priority**: must
- **Source**: tasks.md 6.1, 6.2, 受け入れ基準

**GIVEN** 全実装が完了した状態  
**WHEN** `bun run typecheck && bun run test` を実行する  
**THEN** 型エラー 0 件、テスト全件 pass、既存テストの regression なし
