# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション照合（現状コードの前提）

| アサーション | 結果 |
|---|---|
| `src/prompts/implementer-system.ts:11-74` — lockfile 同期指示なし | ✓ 確認。`IMPLEMENTER_BASE` (lines 11–69) および export (71–74) にロックファイル同期の言及なし |
| `src/core/step/implementer.ts:57-124` — user prompt に lockfile 同期指示なし | ✓ 確認。`buildImplementerInitialMessage` (lines 57–124) の testsMaterialized 両分岐ともに指示なし |
| `src/core/verification/runner.ts:323-343` — `runVerification` が commands/phase 2 経路に分岐 | ✓ 確認。line 323 が関数定義、332–337 で commands/phase dispatch |
| `src/core/verification/runner.ts:384-409` — commands 経路の changed-line-coverage gate 位置 | ✓ 確認。line 384 以降で coverage gate が commands 完了後に実行される |
| `src/core/verification/runner.ts:585-610` — phase 経路の changed-line-coverage gate 位置 | ✓ 確認。line 585 以降で同 gate が phase 完了後に実行される |
| `src/core/verification/runner.ts:459-485` — package-json-integrity は phase 経路のみ | ✓ 確認。`runVerificationPhases` (line 453–) の先頭 459–485 のみに存在。commands 経路にはない（要件 1 の背景）|
| `src/util/detect-pm.ts:25-31` — `LOCKFILE_MAP`（5 エントリ） + `detectPackageManager` seam | ✓ 確認。line 25–31 に `const LOCKFILE_MAP` でpnpm/bun.lockb/bun.lock/yarn/npm の 5 エントリ。`detectPackageManager(cwd)` は `{ pm, root }` を返す |
| `src/core/verification/changed-lines.ts:125` — `getChangedFilesAndLines` | ✓ 確認。line 125 に関数定義。`git diff --name-only --diff-filter=d base...HEAD` で変更ファイル集合を返す |
| `src/core/port/runtime-strategy.ts:479` — `listChangedFiles` | ✓ 確認。line 479 に interface method 定義 |
| `src/config/schema/types.ts:375` — `postMergeVerify`（merge 後安全網） | ✓ 確認。line 375 に `postMergeVerify?: ShellCommand[]` の field 定義 |
| `src/core/verification/__tests__/runner-integrity.test.ts` — テスト雛形 | ⚠ **パス不一致**。実際のパスは `tests/unit/core/verification/runner-integrity.test.ts`（`src/` 配下ではない）|

### 要件整合性確認

- **要件 1**（lockfile 整合 gate）: 追加位置「両経路後段」の前例として挙げられた changed-line-coverage gate の実装を確認。commands 経路 (384–409) と phase 経路 (585–610) いずれも同型の後段配置になっており、実装方針は妥当 ✓
- **要件 2**（偽陽性防止）: 「依存関連セクションのみを比較」で scripts/version の変更を除外する方針は明確。対象セクション（dependencies / devDependencies / peerDependencies / optionalDependencies / overrides / resolutions / packageManager）が列挙されており、実装で迷わない ✓
- **要件 3**（検査対象外・unavailable）: lockfile 非追跡 repo → skip、diff 非導出 → fail させず note の方針は設計判断として記録済み ✓
- **要件 4**（implementer prompt）: 現状の prompt（system: lines 11-74、user: lines 57-124）に指示が無いことを確認 ✓
- **要件 5**（既存 seam）: `detect-pm.ts` + `getChangedFilesAndLines` / `listChangedFiles` の両 seam を明示 ✓

### 受け入れ基準の完全性

全 10 基準とも具体的・テスト可能。「commands / phase 両経路で gate が呼ばれる」という基準が commands 経路の漏れ修正を機械的に保証する点は特に重要。

## 検証できなかった項目

- `LOCKFILE_MAP` は `src/util/detect-pm.ts` で `const`（非 export）。実装時に export するか、`getChangedFilesAndLines` に渡すリストを内部で保持するかは design step の判断に委ねる（request としては seam を正しく指し示しており、問題なし）

## Findings 詳細

### F-001: テスト雛形のパス記載が誤っている（low / fixable）

`現状コードの前提` に記載のパス `src/core/verification/__tests__/runner-integrity.test.ts` は存在しない。  
実際のファイルは `tests/unit/core/verification/runner-integrity.test.ts`。  
実装者が参照先を探す際にパス不一致に気づく必要があるが、Glob で発見可能なため blocking にはならない。  
実装者が request.md を読んで誤ったディレクトリに新規テストを配置するリスクがある（既存テストは `tests/` 配下に集約されているため、`src/__tests__/` に置くと規約違反になる）。
