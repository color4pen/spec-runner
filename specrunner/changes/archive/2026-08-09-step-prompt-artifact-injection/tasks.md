# Tasks: step-prompt-artifact-injection

## T-01: 同梱ビルダーを新規 shared module に実装する

新規ファイル: `src/adapter/shared/artifact-bundle.ts`

- [x] `INPUT_ARTIFACT_NAMES` を export 定数として定義する（この順で走査 = 同梱順）:
      `["request.md", "design.md", "tasks.md", "spec.md", "test-cases.md", "rules.md"]`
- [x] `MAX_ARTIFACT_BUNDLE_BYTES = 64 * 1024`（65536）を export 定数として定義する
- [x] `export async function buildArtifactBundle(cwd: string, slug: string): Promise<string>` を実装する:
  - `changeFolderPath(slug)`（`src/util/paths.js` から import）で change folder 相対パスを得て、
    `path.join(cwd, changeFolderPath(slug), name)` を各 `name` について組み立てる
  - 各 allowlist ファイルを `fs.readFile(..., "utf-8")` で読み、成功したものだけ
    `{ name, content }` として収集する。read 失敗（ENOENT / 権限等）はその 1 件を skip（per-file fail-open）。
    `stat` は使わない
  - 収集が 0 件なら空文字 `""` を返す
  - 収集した content の `Buffer.byteLength(content, "utf-8")` 合計が `MAX_ARTIFACT_BUNDLE_BYTES` を
    超えたら空文字 `""` を返す（fail-open・部分同梱なし）
  - それ以外は D6 の整形でブロック文字列を返す:
    - 先頭に `<bundled-change-artifacts>` と説明文（「既に本文に含まれるため改めて Read する必要はない
      （Read してもよい）／artifact の Read・その他ファイルの探索は従来どおり許可」旨）
    - 各ファイルを `<artifact path="${changeFolderPath(slug)}/${name}">\n${content}\n</artifact>` で包む
    - 末尾を `</bundled-change-artifacts>` で閉じる
- [x] `fs`（`node:fs/promises`）・`path`（`node:path`）・`changeFolderPath` 以外の src/ 依存を増やさない

**Acceptance Criteria**:
- `src/adapter/shared/artifact-bundle.ts` が存在し、`buildArtifactBundle` / `INPUT_ARTIFACT_NAMES` /
  `MAX_ARTIFACT_BUNDLE_BYTES` を export する
- `buildArtifactBundle` は allowlist 外のファイル名を一切 read しない（directory の glob 走査をしない）
- `bun run typecheck` が通る

---

## T-02: claude-code adapter に同梱を配線する

対象: `src/adapter/claude-code/agent-runner.ts`（`run()` 内、L459-467 近傍）

- [x] `artifact-bundle.js` から `buildArtifactBundle` を import する
- [x] `const baseMessage = step.buildMessage(state, stepCtx);` の直後に
      `const artifactBundle = await buildArtifactBundle(cwd, ctx.slug);` を追加する
- [x] `const artifactSection = artifactBundle ? \`\n\n${artifactBundle}\` : "";` を追加する
- [x] `baseFullPrompt` の連結を baseMessage 直後に artifactSection を挟む形へ変更する:
      同梱あり → `${baseMessage}${artifactSection}${resumeSection}\n\n${additionalInstructions}`、
      additionalInstructions 無し分岐 → `${baseMessage}${artifactSection}${resumeSection}`
- [x] `step.buildMessage` の呼び出し・引数・step 側文言は一切変更しない

**Acceptance Criteria**:
- `artifactBundle` が空文字のとき `baseFullPrompt` が変更前とバイト同一（artifactSection == ""）
- completion directive（`firstTurnCompletionDirective`）は従来どおり `baseFullPrompt` の末尾に付く
- `bun run typecheck` が通る

---

## T-03: codex adapter に同梱を配線する

対象: `src/adapter/codex/agent-runner.ts`（`run()` 内、L315-320 近傍）

- [x] `../shared/artifact-bundle.js` から `buildArtifactBundle` を import する
- [x] `const baseMessage = step.buildMessage(state, stepCtx);` の直後に
      `const artifactBundle = await buildArtifactBundle(cwd, ctx.slug);` を追加する
- [x] `const artifactSection = artifactBundle ? \`\n\n${artifactBundle}\` : "";` を追加する
- [x] `baseFullPrompt` の連結を T-02 と同形へ変更する（baseMessage 直後に artifactSection）
- [x] `step.buildMessage` の呼び出し・step 側文言は一切変更しない

**Acceptance Criteria**:
- `artifactBundle` が空文字のとき `baseFullPrompt` が変更前とバイト同一
- 既存 `src/adapter/codex/__tests__/resume-prompt-injection.test.ts` の
  「resume 未指定時にプロンプトがバイト同一」テストが無改変で green（temp cwd に change folder が無いため同梱ゼロ）
- `bun run typecheck` が通る

---

## T-04: 共有層 unit test で同梱ロジックを固定する

新規ファイル: `tests/unit/adapter/shared/artifact-bundle.test.ts`

- [x] `fs.mkdtemp(path.join(os.tmpdir(), "artifact-bundle-test-"))` で temp cwd を作り、
      `specrunner/changes/<slug>/` を掘る helper を用意する（afterEach で `fs.rm(..., recursive)`）
- [x] (a) 存在する入力 artifact が同梱される: `design.md`（内容 "DESIGN"）と `tasks.md`（内容 "TASKS"）を書き、
      返り値に `specrunner/changes/<slug>/design.md` と `.../tasks.md` のパスヘッダおよび
      "DESIGN" / "TASKS" が含まれることを assert
- [x] (b) 存在しない artifact はスキップされる: `design.md` のみ書き、返り値に `design.md` は含まれ、
      `tasks.md` / `spec.md` のパスヘッダが含まれないことを assert
- [x] (c) 出力系 artifact は同梱されない: `design.md` に加え `verification-result.md`・
      `code-review-result-001.md`・`implementation-notes.md` を書き、返り値にこれら 3 つが
      含まれないことを assert
- [x] (d) 合計サイズ上限超過時は同梱なし: 単一ファイルが 64KB 超（例 `"x".repeat(70000)`）のケースで
      返り値が `""` であることを assert。加えて 2 ファイルの合計が 64KB 超のケースでも `""` を assert
- [x] (e) change folder / 入力 artifact 不在:
  - (e-1) change folder を掘らない slug で返り値が `""` を assert
  - (e-2) change folder は存在するが入力 artifact を 1 件も書かない場合でも返り値が `""` を assert
- [x] (f) 非 ENOENT の per-file エラーをスキップする: `fs.readFile` が `EACCES`（権限エラー）を throw する
      ケースを vi.spyOn 等でモックし、他の artifact は正常収集されること・エラーファイルが結果に含まれない
      ことを assert（D4 の「ENOENT / 権限等はすべて per-file skip」を検証）

**Acceptance Criteria**:
- (a)〜(f) の各 case が test として存在し green
- `bun run test tests/unit/adapter/shared/artifact-bundle.test.ts` が green

---

## T-05: adapter 配線を end-to-end で固定する（同梱が実際に prompt に入ること）

要件 #2「同梱が実際に行われる」を機械検証する。既存の prompt キャプチャ harness を流用する。

- [x] codex: `src/adapter/codex/__tests__/resume-prompt-injection.test.ts` の
      `makeCapturingMockThread` パターンを流用した test を追加する（別ファイルでも可）:
      `ctx.cwd` を temp dir にし `specrunner/changes/<slug>/design.md` を書いてから `runner.run(ctx)` を実行、
      `calls[0].prompt` に `<bundled-change-artifacts>` と `specrunner/changes/<slug>/design.md` および
      design.md の内容が含まれることを assert
- [x] claude-code: `src/adapter/claude-code/__tests__/credential-injection.test.ts` の
      `makeCaptureQueryFn` をベースに **`params.prompt` も収集する拡張版 helper**
      （既存の `capturedOptions` に加え `capturedPrompts: string[]` を返す）を
      同テストファイルか別ファイルで定義する（既存の `makeCaptureQueryFn` は `params.options` のみ収集するため
      そのままでは prompt キャプチャ不可 — 拡張または新規 helper が必要）。
      `ctx.cwd`（temp dir）に `specrunner/changes/<slug>/design.md` を書いてから `runner.run(ctx)` を実行、
      キャプチャした prompt に `<bundled-change-artifacts>` と `specrunner/changes/<slug>/design.md` および
      design.md の内容が含まれることを assert

**Acceptance Criteria**:
- codex / claude-code 各 1 件の配線 test が green
- 追加 test が「change folder に artifact を置く→prompt に同梱される」経路を実行している

---

## T-06: 全体検証

- [x] `bun run typecheck` が通る
- [x] `bun run test` が通る（新規 test 含む）
- [x] `src/core/step/` 配下の既存 buildMessage テストが無改変で green（同梱が step 個別文言を
      変えないことの機械検証）
- [x] 既存の adapter プロンプト系テスト（resume-prompt-injection 等）が無改変で green

**Acceptance Criteria**:
- 受け入れ基準 3 項目が全て満たされている:
  1. 共有層 unit test で (a) 存在→同梱 (b) 不在→skip (c) 出力系→除外 (d) 上限超過→同梱なし従来 prompt を固定（T-04）
  2. `src/core/step/` の既存 buildMessage テストが無改変で green
  3. `typecheck && test` が green
