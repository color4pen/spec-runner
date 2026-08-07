# Conformance Result — dead-code-adapter-cli — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### Tasks (tasks.md)
- T-01〜T-17 全チェックボックスが `[x]` であることを確認
- 各タスクのキー acceptance criteria を個別に検証（grep コマンド実行）

### Design decisions (design.md)
- D1: 削除のみ、代替実装なし — 新規コードが追加されていないことを確認
- D2: `REPORT_TOOL` を test-local fixture に移動 — 両 codex test ファイルの `REPORT_TOOL_FIXTURE` を確認
- D3: shim 削除前に importer を repoint — `agent-runner.ts` と `__tests__/` のインポートパスを確認
- D4: `LEVEL_ORDER` を un-export — `src/logger/stdout.ts` の `const LEVEL_ORDER`（export なし）と `isLevelEnabled` の使用を確認
- D5: archive `--dry-run` のみ削除、inbox / prune の dry-run は無変更 — `command-registry.ts` の各 dry-run 出現箇所をコンテキスト付きで確認

### Spec requirements (spec.md)
- R1: 削除シンボルがコードベースに残留しないこと — grep コマンドで全削除対象シンボルを照合
- R2: shim importer が shim 削除前に canonical パスへ repoint されていること — `agent-runner.ts`・`transient-error.test.ts`・`session-log-writer.test.ts` の import を確認
- R3: 共有テストが非削除 assertion を保持していること — `tests/completion.test.ts`・`store.test.ts`・`message-types.test.ts` 等を確認

### Request acceptance criteria (request.md)
- `typecheck && test` green — verification-result.md にて全フェーズ passed を確認
- inbox `--dry-run` と prune dry-run の無変更を確認
- `isToolUse`・codex fixture・`isLevelEnabled` 挙動維持を確認

## 検証できなかった項目

None — 全項目を実行可能な検証手段（grep / ファイル読み取り / git diff 確認）で確認した。

## Findings 詳細

### F-1: xdg.test.ts に stale TC コメントが残存（T-16 AC 違反 / spec R1 違反）

`tests/unit/util/xdg.test.ts` の JSDoc ヘッダ（4〜5 行目）に `resolveXdgStateDir` と `XDG_STATE_HOME` が削除済みテストケースの説明として残っている。

```
 * TC-XDG-01: resolveXdgStateDir returns XDG_STATE_HOME when set
 * TC-XDG-02: resolveXdgStateDir returns ~/.local/state when XDG_STATE_HOME not set
```

T-16 AC は `grep -r "resolveXdgStateDir\|XDG_STATE_HOME" src/ bin/ tests/` が 0 件を要求するが、現状 2 件ヒットする。spec R1 はコメント内の参照も禁止している。

修正: 4〜5 行目の TC-XDG-01 / TC-XDG-02 エントリを削除する。

### F-2: paths.test.ts に stale TC コメントが残存（T-17 AC 違反 / spec R1 違反）

`tests/unit/util/paths.test.ts` の JSDoc ヘッダ（5 行目）に `draftPathLegacy` が削除済みテストケース説明として残っている。

```
 * TC-PATHS-003: draftPathLegacy() returns "specrunner/drafts/<slug>.md"
```

T-17 AC は `grep -r "draftPathLegacy\|draftUsageJsonPath" src/ bin/ tests/` が 0 件を要求するが、現状 1 件ヒットする。

修正: 5 行目の TC-PATHS-003 エントリを削除する。

### F-3: codex test の説明コメントが REPORT_TOOL にワード境界マッチ（T-08 AC 違反 / spec R1 違反）

`tests/adapter/codex/agent-runner.test.ts:15` と `tests/adapter/codex/agent-runner-transient-retry.test.ts:19` に次のコメントが残っている。

```typescript
// Local fixture — replaces the removed REPORT_TOOL production export
```

`REPORT_TOOL ` は word boundary `\bREPORT_TOOL\b` にマッチする。T-08 AC は `grep -r '\bREPORT_TOOL\b' tests/` が 0 件を要求する。機能的な影響はゼロだが、spec R1 はコメント内参照も禁止する。

修正: コメント文言を変更して削除済みシンボル名を避ける（例: `// Local test fixture for the report tool`）。

### F-4: arch-allowlist の XDG_STATE_HOME エントリが stale（スコープ外・低影響）

`tests/unit/architecture/arch-allowlist.ts:170–175` の B-6 エントリ（`pattern: "XDG_STATE_HOME"`, `file: "src/util/xdg.ts"`）は、`resolveXdgStateDir` 削除後に無効化された。allowlist は許可リストとして機能するため、stale エントリはテスト失敗を引き起こさない。本変更の diff 対象外（事前存在エントリ）であり、将来のクリーンアップ対象として記録する。
