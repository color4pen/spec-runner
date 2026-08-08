# Tasks: step-prompt-artifact-injection

## T-01: 同梱ビルダーを新規 shared module に実装する

新規ファイル: `src/adapter/shared/artifact-bundle.ts`

- [ ] `INPUT_ARTIFACT_NAMES` を export 定数として定義する（この順で走査 = 同梱順）:
      `["request.md", "design.md", "tasks.md", "spec.md", "test-cases.md", "rules.md"]`
- [ ] `MAX_ARTIFACT_BUNDLE_BYTES = 64 * 1024`（65536）を export 定数として定義する
- [ ] `export async function buildArtifactBundle(cwd: string, slug: string): Promise<string>` を実装する:
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
- [ ] `fs`（`node:fs/promises`）・`path`（`node:path`）・`changeFolderPath` 以外の src/ 依存を増やさない

**Acceptance Criteria**:
- `src/adapter/shared/artifact-bundle.ts` が存在し、`buildArtifactBundle` / `INPUT_ARTIFACT_NAMES` /
  `MAX_ARTIFACT_BUNDLE_BYTES` を export する
- `buildArtifactBundle` は allowlist 外のファイル名を一切 read しない（directory の glob 走査をしない）
- `bun run typecheck` が通る

---

## T-02: claude-code adapter に同梱を配線する

対象: `src/adapter/claude-code/agent-runner.ts`（`run()` 内、L459-467 近傍）

- [ ] `artifact-bundle.js` から `buildArtifactBundle` を import する
- [ ] `const baseMessage = step.buildMessage(state, stepCtx);` の直後に
      `const artifactBundle = await buildArtifactBundle(cwd, ctx.slug);` を追加する
- [ ] `const artifactSection = artifactBundle ? \`\n\n${artifactBundle}\` : "";` を追加する
- [ ] `baseFullPrompt` の連結を baseMessage 直後に artifactSection を挟む形へ変更する:
      同梱あり → `${baseMessage}${artifactSection}${resumeSection}\n\n${additionalInstructions}`、
      additionalInstructions 無し分岐 → `${baseMessage}${artifactSection}${resumeSection}`
- [ ] `step.buildMessage` の呼び出し・引数・step 側文言は一切変更しない

**Acceptance Criteria**:
- `artifactBundle` が空文字のとき `baseFullPrompt` が変更前とバイト同一（artifactSection == ""）
- completion directive（`firstTurnCompletionDirective`）は従来どおり `baseFullPrompt` の末尾に付く
- `bun run typecheck` が通る

---

## T-03: codex adapter に同梱を配線する

対象: `src/adapter/codex/agent-runner.ts`（`run()` 内、L315-320 近傍）

- [ ] `../shared/artifact-bundle.js` から `buildArtifactBundle` を import する
- [ ] `const baseMessage = step.buildMessage(state, stepCtx);` の直後に
      `const artifactBundle = await buildArtifactBundle(cwd, ctx.slug);` を追加する
- [ ] `const artifactSection = artifactBundle ? \`\n\n${artifactBundle}\` : "";` を追加する
- [ ] `baseFullPrompt` の連結を T-02 と同形へ変更する（baseMessage 直後に artifactSection）
- [ ] `step.buildMessage` の呼び出し・step 側文言は一切変更しない

**Acceptance Criteria**:
- `artifactBundle` が空文字のとき `baseFullPrompt` が変更前とバイト同一
- 既存 `src/adapter/codex/__tests__/resume-prompt-injection.test.ts` の
  「resume 未指定時にプロンプトがバイト同一」テストが無改変で green（temp cwd に change folder が無いため同梱ゼロ）
- `bun run typecheck` が通る

---

## T-04: 共有層 unit test で同梱ロジックを固定する

新規ファイル: `tests/unit/adapter/shared/artifact-bundle.test.ts`

- [ ] `fs.mkdtemp(path.join(os.tmpdir(), "artifact-bundle-test-"))` で temp cwd を作り、
      `specrunner/changes/<slug>/` を掘る helper を用意する（afterEach で `fs.rm(..., recursive)`）
- [ ] (a) 存在する入力 artifact が同梱される: `design.md`（内容 "DESIGN"）と `tasks.md`（内容 "TASKS"）を書き、
      返り値に `specrunner/changes/<slug>/design.md` と `.../tasks.md` のパスヘッダおよび
      "DESIGN" / "TASKS" が含まれることを assert
- [ ] (b) 存在しない artifact はスキップされる: `design.md` のみ書き、返り値に `design.md` は含まれ、
      `tasks.md` / `spec.md` のパスヘッダが含まれないことを assert
- [ ] (c) 出力系 artifact は同梱されない: `design.md` に加え `verification-result.md`・
      `code-review-result-001.md`・`implementation-notes.md` を書き、返り値にこれら 3 つが
      含まれないことを assert
- [ ] (d) 合計サイズ上限超過時は同梱なし: 単一ファイルが 64KB 超（例 `"x".repeat(70000)`）のケースで
      返り値が `""` であることを assert。加えて 2 ファイルの合計が 64KB 超のケースでも `""` を assert
- [ ] (e) change folder / 入力 artifact 不在: change folder を掘らない slug で返り値が `""` を assert

**Acceptance Criteria**:
- (a)〜(e) の各 case が test として存在し green
- `bun run test tests/unit/adapter/shared/artifact-bundle.test.ts` が green

---

## T-05: adapter 配線を end-to-end で固定する（同梱が実際に prompt に入ること）

要件 #2「同梱が実際に行われる」を機械検証する。既存の prompt キャプチャ harness を流用する。

- [ ] codex: `src/adapter/codex/__tests__/resume-prompt-injection.test.ts` の
      `makeCapturingMockThread` パターンを流用した test を追加する（別ファイルでも可）:
      `ctx.cwd` を temp dir にし `specrunner/changes/<slug>/design.md` を書いてから `runner.run(ctx)` を実行、
      `calls[0].prompt` に `<bundled-change-artifacts>` と `specrunner/changes/<slug>/design.md` および
      design.md の内容が含まれることを assert
- [ ] claude-code: `src/adapter/claude-code/__tests__/credential-injection.test.ts` の
      `makeCaptureQueryFn`（`params.prompt` をキャプチャ可能）パターンを流用した test を追加する:
      `ctx.cwd`（temp dir）に `specrunner/changes/<slug>/design.md` を書いてから `runner.run(ctx)` を実行、
      キャプチャした prompt に同梱ブロックと design.md の内容が含まれることを assert

**Acceptance Criteria**:
- codex / claude-code 各 1 件の配線 test が green
- 追加 test が「change folder に artifact を置く→prompt に同梱される」経路を実行している

---

## T-06: 全体検証

- [ ] `bun run typecheck` が通る
- [ ] `bun run test` が通る（新規 test 含む）
- [ ] `src/core/step/` 配下の既存 buildMessage テストが無改変で green（同梱が step 個別文言を
      変えないことの機械検証）
- [ ] 既存の adapter プロンプト系テスト（resume-prompt-injection 等）が無改変で green

**Acceptance Criteria**:
- 受け入れ基準 3 項目が全て満たされている:
  1. 共有層 unit test で (a) 存在→同梱 (b) 不在→skip (c) 出力系→除外 (d) 上限超過→同梱なし従来 prompt を固定（T-04）
  2. `src/core/step/` の既存 buildMessage テストが無改変で green
  3. `typecheck && test` が green
