# Design: step prompt に change folder 入力 artifact を同梱する (step-prompt-artifact-injection)

## Context

local runtime の各 step agent は change folder 直下の入力 artifact（tasks.md / design.md 等）を
buildMessage のパス指示に従い毎回 Read している。直近 2 job（28 セッション）の transcript 実測で
change folder artifact への Read が 46 回 / 580 turn 発生し、同一ファイルが最大 12 セッションで
重複読みされていた。artifact の内容を CLI が prompt 組み立て時に同梱すれば、この Read turn とその
round trip を排除できる。

現状コード（request-review 済・attestation valid）:

- `src/adapter/claude-code/agent-runner.ts:459-486` — `fullPrompt` は
  `step.buildMessage(state, stepCtx)`（baseMessage）+ resumeSection + `buildAdditionalInstructions(ctx)`
  + completion directive の連結で組み立てられる。
- `src/adapter/codex/agent-runner.ts:315-320` — 同形。`baseMessage` + `resumeSection` + `additionalInstructions`。
- `src/adapter/shared/prompt-builder.ts` — `buildAdditionalInstructions` / `buildResumeSection` は
  claude-code / codex の 2 adapter **のみ**が import する共有層（grep 実測: import 元は当該 2 adapter とそのテストだけ）。
- 各 step の buildMessage は artifact をパスで指示し agent に Read させる:
  implementer.ts:96 / conformance.ts:85-86 / code-review.ts:78 / custom-reviewer.ts:62。
- `src/util/paths.ts:19` — `changeFolderPath(slug)` が `specrunner/changes/<slug>` を返す（pure）。

managed runtime（`src/adapter/managed-agent/agent-runner.ts:611-632`）は prompt を **shared 層を経由せず
インラインで組み立てる**。かつ step 出力 artifact は remote branch 上に存在し、
`AgentRunResult.resultContent` の doc（`src/core/port/agent-runner.ts:233-239`）どおり
`GitHubClient.getRawFile()` で GitHub から取得される。すなわち managed の local worktree（`ctx.cwd`）には
step 出力 artifact が無く、prompt 組み立て時点の local fs 読み取りでは 0 件になる。

なお「同梱ブロックをセッション間で prompt cache 共有する」構想は制御実験で不成立が確認済み
（cache breakpoint は tools ブロック末尾と message 全体末尾にのみ存在し、message 途中の共通 prefix は
共有されない）。本変更の目的は turn 削減と latency 短縮のみで、cache 共有前提のレイアウト制約は課さない。

## Goals / Non-Goals

**Goals**:

- agent を起動する local runtime の全 step で、prompt 組み立て時に change folder 直下の入力系 artifact の
  うち **その時点で存在するもの** の内容を prompt へ同梱する。対象:
  `request.md` / `design.md` / `tasks.md` / `spec.md` / `test-cases.md` / `rules.md`。
- 同梱ロジックを adapter 共有層の 1 モジュールに集約し、claude-code / codex 両 adapter がそれを呼ぶ。
- 各 step の buildMessage 文言は一切変更しない。
- 出力系 artifact（`verification-result.md` / `*-result-*.md` / `implementation-notes.md` 等）は同梱しない。
- 合計サイズが上限（64KB）を超える場合は同梱せず従来 prompt にフォールバックする（fail-open）。
- 同梱後も agent の Read・探索は従来どおり許可されたまま。

**Non-Goals**:

- **managed runtime への同梱**: managed は (1) 共有 prompt-builder を経由せずインラインで prompt を組み立て、
  (2) step 出力 artifact が remote branch にあり local worktree に無いため、prompt 組み立て時点の
  local fs 読み取りでは効果ゼロ。実測の Read 削減効果も local runtime 由来。よって本変更の対象外とし、
  必要になれば別 request で扱う（D1 参照）。これは "共有層 1 箇所" という architect 判断の帰結であり、
  恣意的なスコープ縮小ではない。
- prompt cache 共有を意図したバイト同一レイアウト制約（実験で不成立確認済み）。
- 部分同梱（大きいファイルだけ除外等）。
- touched files の step 間伝搬（別 request）。
- 効果実測（merge 後に attended で実施）。

## Decisions

### D1: 注入点は新規 shared module 1 つ、両 local adapter が呼ぶ

`src/adapter/shared/artifact-bundle.ts` を新設し、`buildArtifactBundle(cwd, slug)` を export する。
claude-code / codex の両 adapter が baseMessage 組み立て直後にこれを呼び、返り値（空文字なら未同梱）を
prompt に挿入する。同梱ロジック本体は 1 モジュールに集約されるため "共有層 1 箇所" を満たす。

**却下した代替案**:
- step 個別の buildMessage に注入 → 全 step の文言・テスト改修が発生しレビュー収束ループが肥大（architect 却下）。
- 既存 `prompt-builder.ts` に追記 → 同ファイルは同期 pure で、fs I/O を伴う非同期関数を混在させると
  既存の同期テスト前提が濁る。近傍の別ファイルに分離する方が境界が明快（"prompt-builder 近傍" を満たす）。
- worktree の CLAUDE.md を運搬役にする → CLAUDE.md に独自 cache breakpoint が無く cache 利得ゼロ、
  agent への注入経路が prompt と二重になるだけ（architect 却下）。
- managed adapter にも第 2 注入点を置く → Context 記載のとおり効果ゼロかつ "1 箇所" に反する。対象外。

### D2: 同梱対象は固定 allowlist。出力系は構造的に除外

`INPUT_ARTIFACT_NAMES = ["request.md", "design.md", "tasks.md", "spec.md", "test-cases.md", "rules.md"]`
を定数として持ち、この順で走査する。directory を glob 走査せず allowlist のファイル名のみを直接読むため、
出力系 artifact（`verification-result.md` / `*-result-NNN.md` / `implementation-notes.md` 等）は
**allowlist に無い＝構造的に同梱されない**。誤同梱の判断を実行時に行わないので誤りが起きない。

**却下**: directory を列挙して除外パターンで弾く方式 → 新しい出力ファイル名が増えるたびに除外漏れリスク。
allowlist（許可）方式は既定拒否で安全。

### D3: サイズ上限超過は全同梱中止（fail-open）、部分同梱なし

`MAX_ARTIFACT_BUNDLE_BYTES = 64 * 1024`（65536）。存在した対象ファイルの content バイト数
（`Buffer.byteLength(content, "utf-8")`）の合計がこの値を超えたら、`buildArtifactBundle` は空文字を返し、
adapter は従来どおりの prompt（同梱ブロックなし）を組み立てる。部分同梱はしない。

**却下**: 大きいファイルだけ除外する部分同梱 → 「どれが同梱済みか」の判断を agent に強いる（architect 却下）。

### D4: 存在判定は readFile の ENOENT で行う（stat 別呼びしない）

各 allowlist ファイルを `fs.readFile` で読み、失敗（ENOENT / 権限等）した個別ファイルは skip する
（per-file fail-open）。存在確認のための `stat` 別呼びはしない — TOCTOU を作らず、呼び出しも半減する。
change folder ごと存在しない場合は全 read が失敗し found=[] → 空文字を返す（＝従来 prompt）。

### D5: prompt 挿入位置は baseMessage 直後。両 adapter 同形、buildMessage 不変

同梱ブロックは baseMessage の直後（resumeSection / additionalInstructions の前）に挿入する。
buildMessage が指示する artifact 群の直後に「その内容」が続く並びで、意味的に自然。両 adapter で:

```
const artifactBundle = await buildArtifactBundle(cwd, ctx.slug);
const artifactSection = artifactBundle ? `\n\n${artifactBundle}` : "";
// baseFullPrompt = `${baseMessage}${artifactSection}${resumeSection}` (+ additionalInstructions)
```

`artifactBundle` が空文字のとき `artifactSection` も空文字となり、prompt は従来とバイト同一
（既存の "resume 未指定時にプロンプトがバイト同一" 系 adapter テストは change folder を temp cwd に持たないため
同梱ゼロ→無改変で green）。buildMessage は呼び出しも文言も変更しない。

### D6: 同梱ブロックの整形（code fence 衝突回避 + Read 不要の明示）

ラッパは XML 風にし、各ファイルを `<artifact path="...">` で包む。md content 内の ```` ``` ```` フェンスと
衝突しないため、design.md / tasks.md 等（フェンスを含む markdown）を安全に包める。path 属性が
requirement #2 の「パス名ヘッダ」を兼ねる（buildMessage が Read 指示するのと同じ worktree 相対パス）。

```
<bundled-change-artifacts>
以下は change folder 直下の入力 artifact の現時点の内容です。既に本文に含まれているため、
改めて Read する必要はありません（必要なら Read しても構いません）。artifact の Read や
その他ファイルの探索は従来どおり許可されています。

<artifact path="specrunner/changes/<slug>/request.md">
...request.md の内容...
</artifact>

<artifact path="specrunner/changes/<slug>/design.md">
...design.md の内容...
</artifact>
</bundled-change-artifacts>
```

ブロック先頭の説明文が requirement #2（Read 不要の明示）と requirement #4（探索非制限）を満たす。

## Risks / Trade-offs

**[Risk] artifact content に `</artifact>` リテラルが含まれると区切りが壊れる**
→ Mitigation: 対象は change folder の markdown 6 種で、この literal がまず出現しない。万一含まれても
agent は本文 md を別途 Read でき（探索は非制限）、機能低下は Read turn 削減の取りこぼしのみで破壊はない
（fail-open）。過剰なエスケープ処理は入れない。

**[Risk] 同梱で prompt / 入力 token が増える（resume turn でも毎回同梱）**
→ Mitigation: 目的が Read turn とその round trip の削減であり、token 増とのトレードオフは request 承認済み。
64KB 上限で肥大を頭打ちにする。cache 共有前提は置かない（実験で不成立確認済み）。

**[Risk] 大きい change folder で 64KB 超過→同梱されず効果が出ない**
→ Mitigation: fail-open として許容。実測の重複 Read は上限内サイズの artifact が主因で、上限超過は例外的。
上限値は定数 1 箇所で調整可能。

## Open Questions

なし（architect 評価済み）。managed 非対象の判断は D1 / Non-Goals に根拠付きで明示済み。
