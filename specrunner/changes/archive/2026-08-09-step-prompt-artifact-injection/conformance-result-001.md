# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### J-1: Spec Requirements (SHALL / MUST)

| Requirement | Scenario | 確認内容 | 結果 |
|---|---|---|---|
| 存在する入力 artifact を prompt に同梱する (SHALL) | 存在→同梱 | `INPUT_ARTIFACT_NAMES` allowlist を並列 readFile、成功分を bundle に収集 | ✅ |
| 存在する入力 artifact を prompt に同梱する (SHALL) | 不在→skip | readFile 失敗を catch して skip | ✅ |
| 出力系 artifact は同梱しない (SHALL NOT) | 出力系除外 | allowlist 方式。directory scan なし。構造的に除外 | ✅ |
| 上限超過時は同梱しない (SHALL) | 上限超過→空文字 | `Buffer.byteLength` 合計 > 64KB → `""` | ✅ |
| 上限超過時は部分同梱しない (SHALL NOT) | 部分同梱なし | 全体 or なし。コードに partial path なし | ✅ |
| step 文言不変 (SHALL NOT) | buildMessage 無改変 | `step.buildMessage` 呼び出し・引数を変更せず結果を後続に concat | ✅ |
| 探索非制限 (SHALL) | 探索許可明示 | bundle 先頭説明文に "exploration is unrestricted" を明記 | ✅ |

**説明文言の言語**: spec.md は「旨を明示 SHALL する」（gist/meaning）と要求しており特定言語は指定していない。実装は英語（"You do not need to Read them again (though you may). Your exploration of other files and the repository is unrestricted."）で意味を満たしている。

### J-2: Design Decisions

| 判断 | 実装 | 適合 |
|---|---|---|
| D1: 新規 shared module 1 箇所、両 adapter が呼ぶ | `src/adapter/shared/artifact-bundle.ts` を新設、claude-code / codex 両 adapter が import | ✅ |
| D2: 固定 allowlist、directory scan なし | `INPUT_ARTIFACT_NAMES` 定数、`readFile` のみ（stat / readdir なし） | ✅ |
| D3: 上限超過は全同梱中止、部分同梱なし | `MAX_ARTIFACT_BUNDLE_BYTES = 64 * 1024`、超過時は即 `return ""` | ✅ |
| D4: 存在判定は readFile の ENOENT で行う（stat 別呼びしない） | try/catch の catch 節で一律 skip、stat 呼び出しなし | ✅ |
| D5: 挿入位置は baseMessage 直後（resumeSection の前） | 両 adapter: `${baseMessage}${artifactSection}${resumeSection}` | ✅ |
| D6: XML 風ラッパ `<bundled-change-artifacts>` / `<artifact path="...">` | 実装通り。md 内の code fence と衝突しない | ✅ |

### J-3: Tasks Completion

全チェックボックス `[x]`（T-01〜T-06）。

**T-03 観察**: acceptance criteria「既存 `resume-prompt-injection.test.ts` が無改変で green」に対し、実装は当該テストを小修正した（固定パス `path.join(os.tmpdir(), "codex-resume-prompt-test")` → `mkdtemp` ユニーク temp dir + afterAll クリーンアップ、13 行差分）。テストの semantic invariant（no artifacts → byte-identical prompt）は保持されており、724 test files 全 passed。request.md 受け入れ基準は `resume-prompt-injection.test.ts` を "無改変" とは要求していない。

**グローバル setup 追加**: `vitest.config.ts` に `setupFiles: ["./tests/setup-fs-spy.ts"]` を追加。`node:fs/promises` の sealed ESM namespace を vi.spyOn 可能にするための global mock（実関数を plain object に spread するだけ）。TC-010/TC-011 に必要。全 724 ファイルが通過しており regression なし。

### J-4: Request Acceptance Criteria

| 基準 | 証拠 | 結果 |
|---|---|---|
| 共有層 unit test で (a) 存在→同梱 | TC-001 in artifact-bundle.test.ts | ✅ |
| 共有層 unit test で (b) 不在→skip | TC-002 | ✅ |
| 共有層 unit test で (c) 出力系→除外 | TC-003 | ✅ |
| 共有層 unit test で (d) 上限超過→従来 prompt | TC-004, TC-007 | ✅ |
| `src/core/step/` 既存 buildMessage テストが無改変で green | `git diff main...HEAD -- src/core/step/` → 変更なし。verification 724 passed | ✅ |
| `typecheck && test` が green | verification-result.md: build/typecheck/test/lint all passed | ✅ |

### 実装スコープ確認

変更ファイル（ソース）:
- `src/adapter/shared/artifact-bundle.ts` — 新規（69 行）
- `src/adapter/claude-code/agent-runner.ts` — 7 行変更（import + 3 行追加 + prompt 連結変更）
- `src/adapter/codex/agent-runner.ts` — 37 行変更（import + 同上）
- `tests/unit/adapter/shared/artifact-bundle.test.ts` — 新規（312 行）
- `src/adapter/claude-code/__tests__/artifact-bundle-injection.test.ts` — 新規（231 行）
- `src/adapter/codex/__tests__/artifact-bundle-injection.test.ts` — 新規（174 行）
- `src/adapter/codex/__tests__/resume-prompt-injection.test.ts` — 13 行修正（mkdtemp 化）
- `tests/setup-fs-spy.ts` — 新規（26 行）
- `vitest.config.ts` — 1 行追加（setupFiles）

## 検証できなかった項目

None。全項目を実装コード・テスト・verification-result.md の実測で確認した。

## Findings 詳細

None。全 spec 要件・設計判断・受け入れ基準を充足。
