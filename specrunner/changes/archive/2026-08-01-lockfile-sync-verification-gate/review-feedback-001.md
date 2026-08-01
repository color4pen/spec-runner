# Code Review Feedback — iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 変更スコープの確認

`git diff main...HEAD --stat` で 23 ファイル 3051 行追加を確認。主要変更:
- `src/core/verification/lockfile-sync.ts`（新規）
- `src/util/detect-pm.ts`（additive: `findLockfile`, `isLockfileName`）
- `src/core/verification/changed-lines.ts`（additive: `getChangedFileList`）
- `src/core/verification/runner.ts`（gate 配線）
- `src/core/step/implementer.ts`（prompt 追記）
- テスト 5 ファイル新規

### 実装の読み込み

- `lockfile-sync.ts`: 全文精読。pure helper（`sortedValue`, `canonicalJson`, `extractDepSections`, `depSectionsDiffer`）、pure evaluator（`evaluateLockfileSync`）、orchestrator（`runLockfileSyncGate`）の分離を確認
- `runner.ts`: `runVerificationCommands` の L421-441 と `runVerificationPhases` の L645-665 を精読し、両経路に gate が配置されていることを確認。`baseBranch !== undefined` ガードの位置を確認
- `implementer.ts`: `buildImplementerInitialMessage` の testsMaterialized=true（L100）と false（L120）の両分岐に同一文言が挿入されていることを確認
- `detect-pm.ts`: `findLockfile` の upward search ロジックが `detectPackageManager` の phase-1 と同型であることを確認。`isLockfileName` が `LOCKFILE_MAP` を参照していることを確認
- `changed-lines.ts`: `getChangedFileList` が `spawnGit` seam を再利用し、throw 伝播が `runLockfileSyncGate` の catch に到達することを確認

### テストカバレッジ確認

test-cases.md の TC 全 25 件を精読し、対応テストコードの実装を確認:

| TC | 優先度 | ファイル | 確認ポイント |
|---|---|---|---|
| TC-001 | must | `lockfile-sync.test.ts:236` | `bun install` + `commit` キーワード照合 |
| TC-002 | must | `lockfile-sync.test.ts:271` | `status: "passed"` |
| TC-003 | must | `lockfile-sync.test.ts:332` | `packages/foo/package.json` ディスク配置でゲート発火 |
| TC-004 | must | `lockfile-sync.test.ts:288` | `status: "skipped"` で非 failed |
| TC-005 | must | `lockfile-sync.test.ts:309` | `status: "skipped"` + stdout 非空 |
| TC-006 | must | `lockfile-sync.test.ts:371` | throwing spawn + non-0 exit の 2 パターン |
| TC-007 | must | `runner-lockfile-gate.test.ts:161` | mock 呼び出し + verdict 反映 |
| TC-008 | must | `runner-lockfile-gate.test.ts:206` | commands 経路 mock 呼び出し |
| TC-009 | should | `runner-lockfile-gate.test.ts:252` | phases / commands 両経路で gate 非出現 |
| TC-010 | must | `implementer-lockfile.test.ts:17` | 両分岐 + `<user-request>` 内包確認 |
| TC-011 | should | `detect-pm-lockfile.test.ts:18` | 全 LOCKFILE_MAP エントリ + 否定ケース |
| TC-012 | should | `detect-pm-lockfile.test.ts:56` | `fsLike` 注入で `{ pm, filename, root }` 検証 |
| TC-013 | should | `detect-pm-lockfile.test.ts:80` | `fsLike` 全 false → `null` |
| TC-014 | should | `changed-lines-filelist.test.ts:45` | 末尾空行除去・空配列 |
| TC-015 | must | `changed-lines-filelist.test.ts:65` | exit 1 / 128 で throw 確認 |
| TC-016 | should | `lockfile-sync.test.ts:109` | 7 セクション全種追加ケース |
| TC-017 | should | `lockfile-sync.test.ts:157` | scripts / version のみ差 → false |
| TC-018 | could | `lockfile-sync.test.ts:185` | key 並び替え → false |
| TC-019 | should | `lockfile-sync.test.ts:197` | base=null → true |
| TC-020 | could | `lockfile-sync.test.ts:219` | malformed headPkg → false |
| TC-021 | should | `lockfile-sync.test.ts:416` | package.json 含まない変更集合 → skipped |
| TC-022 | could | `lockfile-sync.test.ts:440` | `some-package.json` → skipped（basename 比較） |
| TC-023 | could | `lockfile-sync.test.ts:464` | HEAD 読取不能 → skipped |
| TC-024 | must | `runner-lockfile-gate.test.ts:294` | commands / phases 両経路 fail-fast |
| TC-025 | must | `git diff main...HEAD -- package.json` | 出力なし（新規 runtime 依存ゼロ） |

must 12 件すべて実装済みを確認。

### 設計整合性の確認

- **両経路後段配置（D2）**: `runVerificationCommands` の L421 と `runVerificationPhases` の L645 に同型の gate ブロックを確認。`baseBranch === undefined` 時は gate ブロック自体をスキップ。既存テストへの影響なし（`baseBranch` なし呼び出し群は gate ブロックに到達しない）
- **pure / orchestrator 分離（D8）**: `depSectionsDiffer`, `evaluateLockfileSync` が pure、`runLockfileSyncGate` が I/O オーケストレーション。`changed-line-coverage` と同型の分割を確認
- **偽陽性回避（D4）**: canonical JSON 化（key 再帰ソート）確認。HEAD parse 不能は `continue` で「依存変更なし」に倒す安全側倒しを確認
- **seam 再利用（D5）**: `getChangedFileList` が既存 `spawnGit` を使用、`findLockfile` / `isLockfileName` が既存 `LOCKFILE_MAP` を参照していることを確認
- **prompt 二層（D7）**: `implementer.ts` の testsMaterialized 両分岐に step 5 として同一文言。`implementer-system.ts` は無変更を確認

### 検証結果

`verification-result.md` にて `verdict: passed`、10062 passed（679 test files）、typecheck / lint 含め全フェーズ green を確認。

## 検証できなかった項目

None — 全受け入れ基準をコードとテストで確認済み。

## Findings 詳細

### F-001: `LOCKFILE_SYNC_PHASE` 定数の二重定義 [low]

**箇所**: `runner.ts:28` / `lockfile-sync.ts:36`

`"lockfile-sync"` フェーズ名が 2 か所に存在する。`runner.ts` の L24-27 コメントに設計意図が明記されており（`lockfile-sync.ts` を static import すると vi.mock factory の TDZ エラーが起きるため dynamic import を採用し local const で相補する）、意図した構造。フェーズ名変更時は 2 か所を同時更新する必要がある。TypeScript string literal 型で型レベルの整合は担保されている。

### F-002: `slug` パラメータが未使用 [low]

**箇所**: `lockfile-sync.ts:255-262`

`runLockfileSyncGate` のインターフェースに `slug: string` を宣言しているが、関数本体では destructure もされず使用されない。他ゲートとの API 対称性のための宣言と推察。機能上の問題なし。lint が未使用パラメータ警告を出す場合は `_slug` へのリネームを検討。

### F-003: `gitShowFile` 内の型キャストが冗長 [low]

**箇所**: `lockfile-sync.ts:210-217`

`(spawnFn as unknown as SpawnWithOptions)(...)` というキャストで spawn を呼び出している。同じ `SpawnFn` 型を使う `spawnGit`（`changed-lines.ts:68`）はキャストなしで同一の 3 引数呼び出しを行っており、`gitShowFile` でのキャストは不要。private 関数でテストカバレッジも十分なため実害はないが、型安全性を不要に弱めている。将来的に `spawnGit` と同パターンに揃えることを検討。

