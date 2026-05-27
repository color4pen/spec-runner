# Test Cases: file-permission-hardening

## TC-01: atomicWriteJson — mode 未指定時に 0o600 が適用される

- **Category**: unit
- **Priority**: must
- **Source**: T-01 acceptance / request 要件 1

**GIVEN** `atomicWriteJson` を options なし（`undefined`）で呼び出す  
**WHEN** 書き込みが完了する  
**THEN** 最終ファイルのパーミッションが `0o600` である

---

## TC-02: atomicWriteJson — options.mode 省略時（空オブジェクト渡し）に 0o600 が適用される

- **Category**: unit
- **Priority**: must
- **Source**: T-01 acceptance / `options?.mode ?? 0o600` の分岐確認

**GIVEN** `atomicWriteJson(path, data, {})` のように mode を含まない options を渡す  
**WHEN** 書き込みが完了する  
**THEN** 最終ファイルのパーミッションが `0o600` である

---

## TC-03: atomicWriteJson — 明示 mode が優先される

- **Category**: unit
- **Priority**: must
- **Source**: T-01 acceptance "mode 明示指定時にその値が使われる" / credentials-io.ts 後退防止

**GIVEN** `atomicWriteJson(path, data, { mode: 0o644 })` のように mode を明示指定する  
**WHEN** 書き込みが完了する  
**THEN** 最終ファイルのパーミッションが指定値 `0o644` である（デフォルト 0o600 に上書きされない）

---

## TC-04: atomicWriteJson — credentials-io.ts の `{ mode: 0o600 }` 明示指定が引き続き機能する

- **Category**: regression
- **Priority**: must
- **Source**: T-03 acceptance / request 受け入れ基準 "credentials-io.ts の明示指定は機能する"

**GIVEN** `credentials-io.ts` が `{ mode: 0o600 }` を明示して `atomicWriteJson` を呼び出す  
**WHEN** credentials ファイルを書き込む  
**THEN** ファイルのパーミッションが `0o600` であり、動作変更なし

---

## TC-05: atomicWriteJson — config/store.ts の `{ mode: CONFIG_MODE }` 明示指定が維持される

- **Category**: regression
- **Priority**: must
- **Source**: T-03 acceptance "config/store.ts の指定が残っていること"

**GIVEN** `config/store.ts` が `{ mode: CONFIG_MODE }` (= 0o600) を明示して `atomicWriteJson` を呼び出す  
**WHEN** config ファイルを書き込む  
**THEN** ファイルのパーミッションが `0o600` であり、動作変更なし

---

## TC-06: atomicWriteJson — tmp file に O_EXCL (`wx`) フラグが使われる

- **Category**: unit
- **Priority**: must
- **Source**: T-01 acceptance "writeFile の flag が `wx` である" / request 要件 2

**GIVEN** `atomicWriteJson` を通常パラメータで呼び出す  
**WHEN** tmp file の書き込みを行う  
**THEN** `fs.writeFile` が `{ flag: "wx", mode }` で呼ばれ、`O_EXCL` が適用されている

---

## TC-07: atomicWriteJson — tmp file が既存の場合 EEXIST で失敗しクリーンアップされる

- **Category**: unit
- **Priority**: must
- **Source**: D2 設計 "ファイルが既に存在する場合は EEXIST で失敗する"

**GIVEN** `atomicWriteJson` が tmp file を作成しようとする直前に、同名の tmp file が既に存在する  
**WHEN** `fs.writeFile` が EEXIST エラーを返す  
**THEN** エラーが呼び出し元に伝播し、tmp file のクリーンアップ（`unlink`）が試みられる

---

## TC-08: atomicWriteJson — if/else 分岐が削除され chmod が常に実行される

- **Category**: code-structure
- **Priority**: must
- **Source**: T-01 acceptance "if/else 分岐が削除されている" / "chmod が常に実行される"

**GIVEN** `src/util/atomic-write.ts` の実装コード  
**WHEN** コードを静的に確認する  
**THEN** `writeFile` の呼び出しが 1 本に統合されており、mode の有無による `if/else` 分岐が存在せず、`chmod` が常に実行される

---

## TC-09: atomicWriteJson — tmp file クリーンアップはエラー時も実行される

- **Category**: unit
- **Priority**: should
- **Source**: 既存 catch ブロックの振る舞い確認（O_EXCL 追加後も同等であること）

**GIVEN** `fs.writeFile` が何らかのエラー（EEXIST 含む）をスローする  
**WHEN** catch ブロックが実行される  
**THEN** `fs.unlink(tmpPath)` が呼ばれ、tmp file の残留が防がれる

---

## TC-10: initVerboseLog — verbose log ファイルが 0o600 で作成される

- **Category**: unit
- **Priority**: must
- **Source**: T-02 acceptance / request 要件 3

**GIVEN** ログレベルが `verbose` 以上で `initVerboseLog(repoRoot, jobId)` を呼び出す  
**WHEN** verbose log ファイルが新規作成される  
**THEN** `openSync(currentLogPath, "a", 0o600)` が呼ばれ、ファイルのパーミッションが `0o600` である

---

## TC-11: initVerboseLog — verbose 無効時は log ファイルを作成しない

- **Category**: regression
- **Priority**: should
- **Source**: 既存振る舞いの後退防止

**GIVEN** ログレベルが `default`（verbose 未満）で `initVerboseLog` を呼び出す  
**WHEN** 関数が実行される  
**THEN** `openSync` は呼ばれず、`logFd` は null のまま

---

## TC-12: job-state-store — jobs/*.json が 0o600 で書き込まれる

- **Category**: integration
- **Priority**: must
- **Source**: D1 影響範囲 "job-state-store.ts — .specrunner/jobs/*.json が 0o600 になる"

**GIVEN** `job-state-store.ts` が mode 未指定で `atomicWriteJson` を呼び出す  
**WHEN** job state ファイルが新規作成される  
**THEN** ファイルのパーミッションが `0o600` である（umask 依存の 0o644 にならない）

---

## TC-13: usage/store — usage.json が 0o600 で書き込まれる

- **Category**: integration
- **Priority**: should
- **Source**: D1 影響範囲 "usage/store.ts — usage.json が 0o600 になる"

**GIVEN** `src/core/usage/store.ts` が mode 未指定で `atomicWriteJson` を呼び出す  
**WHEN** usage.json が新規作成される  
**THEN** ファイルのパーミッションが `0o600` である

---

## TC-14: typecheck — 変更後もコンパイルエラーなし

- **Category**: build
- **Priority**: must
- **Source**: T-01, T-02, T-03 acceptance / request 受け入れ基準

**GIVEN** T-01・T-02 の実装変更が適用されている  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件でコマンドが正常終了する

---

## TC-15: test suite — 既存テストが全て green

- **Category**: regression
- **Priority**: must
- **Source**: T-03 acceptance / request 受け入れ基準

**GIVEN** T-01・T-02 の実装変更が適用されている  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass し、失敗が 0 件である
