# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### Requirement: CommandHandler は exit code を返す単一契約である

- `src/cli/command-handler.ts` を確認。`CommandHandler` は `(parsed: ParsedArgs, ctx?: CommandContext) => Promise<number>` として定義されており、`Promise<void>` 型や migration adapter は存在しない。
- `grep -rn "Promise<number>" src/cli --include="*.ts" | grep -v "__tests__" | grep "export.*handle"` の結果: 30件。全 handler が `Promise<number>` を返すと宣言している。
- `void wrapper` の削除を確認: `runRun`/`runResume`/`runReopen` の識別子が `src/cli/run.ts`、`src/cli/resume.ts`、`src/cli/reopen.ts` の production コードに存在しない。
- architecture-ratchet.test.ts Check 8 (AST ベース): `CommandHandler` 型が `Promise<number>`、全 `handle*` export が `Promise<void>` でないことを機械検査している。regression guard 付き。

### Requirement: process termination は CLI entrypoint が単独で所有する

- `grep -rn "process\.exit(" src/cli --include="*.ts" | grep -v "/__tests__/"` の結果: JSDoc コメント内のみ（actual call expression = 0件）。
- architecture-ratchet.test.ts Check 7 (AST ベース): `src/cli/**/*.ts` の `process.exit` CallExpression を 0件と検査。コメントを除外することを regression guard で確認。
- `bin/specrunner.ts` の dispatch 構造（lines 120-138）を確認:
  - `let code: number` を try/catch の前に宣言
  - `try { code = await spec.handler!(parsed, ctx); }` として handler を呼ぶ
  - `process.exit(code)` が try/catch の**外側**（line 138）に配置されている（D3 準拠）
  - handler が `0` を返したとき、dispatch catch には入らないため追加の stderr 出力が発生しない

### Requirement: 共通の error-to-exit 変換は dispatch error boundary に一本化される

- `bin/specrunner.ts` lines 124-136 の dispatch catch を確認:
  - `FlagParseError` → `stderrWrite(e.message)` + `stderrWrite(spec.help?.detail ?? USAGE)` + `process.exit(2)` ✅
  - `SpecRunnerError` → `stderrWrite("Error: ...")` + `stderrWrite("Hint: ...")` + `process.exit(e.exitCode)` ✅
  - unknown → `stderrWrite("Fatal: ...")` + `process.exit(1)` ✅
- 全 3 変換が `stderrWrite`（= `maskSensitive` seam）経由であることを確認（D5 準拠）。
- 共通変換のみの catch が `job-resume-handler.ts`/`job-archive-handler.ts`/`reopen.ts`/`prune.ts`/`attach.ts` に存在しないことを確認（`SpecRunnerError`/`Fatal:` パターンのキーワード grep で 0 件）。

### Requirement: domain 上意味のある catch と fallback は維持される

- `doctor.ts` `handleDoctor`: try/catch が残り、`SpecRunnerError` を区別せずに全部 `Fatal:/1` で処理していることを確認（design D8 の判定基準を正しく適用）。
- `doctor.ts` `handleDoctorRepair`: 独自の `Error: <msg>` 形式を維持。
- `ps.ts` `handleJobLs`: GitHub client 構築の fallback catch 構造が残っていることを確認（`Promise<number>` 宣言 + catch 存在）。
- `job-start-handler.ts`: config/token/origin の domain catch を grep で確認（`src/cli/job-start-handler.ts` に `domain` catch 関連の記述が維持されている）。

### Requirement: CLI 契約と終了契約が base と candidate で同一である

- `src/cli/__tests__/fixtures/cli-exit-contract.base.json` が存在し、23件の case ID（EC-01 〜 EC-23）を含むことを確認。
- `cli-exit-contract.test.ts` に 23件のケースを fixture と比較する test が実装されている。fixture completeness guard（ID 集合の完全一致）も実装済み。
- `exit-contract-cases.ts` に 23件の case 定義が存在。EC-01（success-zero）の fixture entry で stderr が空配列であることを確認。
- `exit-contract-harness.ts` に最初の `process.exit` 呼び出しでスナップショットを打ち切るロジックが実装されていることを確認（D6 準拠）。
- `cli-contract-snapshot.test.ts`（CommandSpec 構造比較）は R3a から継続して存在。

### Requirement: 再分散を防ぐ architecture ratchet が存在する

- Check 7: `src/cli` の `process.exit` CallExpression = 0 を AST 検査。regression guard ×2（検出確認 + コメント除外確認）。
- Check 8: CommandHandler 型 + 全 handle* export の戻り型を AST 検査。regression guard（`Promise<void>` を検出）。
- Check 9: `process.exit` 所有先を `{ bin/specrunner.ts, src/core/runtime/local.ts, src/core/runtime/managed.ts }` の厳密一致で検査。allowlist に signal handler である旨を明記。regression guard（第 4 ファイルを混入した場合に違反検出）。
- Check 10: `bin/specrunner.ts` に `SwitchStatement` が存在せず、`spec.handler` の呼び出しが 1 箇所のみであることを AST 検査。

## 検証できなかった項目

- `bun run test` の実際の実行結果（green 確認）: CI ログ参照が必要。verification-result.md は green を示している（verification step が通過した実績から推定）。
- `cli-contract-snapshot.test.ts` が R3a base fixture と一致しているかの動的確認: テストを実行していないが、Check 1〜6 + cli-contract-snapshot の継続は、architecture-ratchet の設計から担保される。

## Findings 詳細

None。normative 要件（request / spec の SHALL / MUST 項目）に対する違反は検出されなかった。

- **plan 観点（non-blocking）**: `generate-exit-contract-fixture.test.ts` は通常テスト suite に含まれない fixture 再生成ツールとして追加された。ヘッダに再生成手順が記載されており、設計意図（D6）と一致する。
- **D3 準拠**: `process.exit(code)` が try/catch の外側に置かれていることを line-level で確認した。正常終了時に偽の `Fatal:` 出力が発生しない構造になっている。
- **D5 準拠**: dispatch error boundary の 3 変換（FlagParseError / SpecRunnerError / unknown）が全て `stderrWrite`（maskSensitive seam）経由であることを確認した。help/version/no-args 等の既存 entrypoint 出力は `process.stderr.write` 直接使用のまま（design D4/D5 の意図どおり）。
