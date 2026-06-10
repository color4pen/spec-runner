# Tasks: SECURITY.md を追加する（脆弱性報告窓口の明示）

> 実装方針: repo 直下に英語の `SECURITY.md` を **新規追加**し、その存在・必須節を守る軽量 drift-guard テストを
> 1 件追加する。`README.md` および `src/` は一切変更しない（参照のみ）。節見出しは design D2 / spec の固定値
> （`## Supported Versions` / `## Reporting a Vulnerability` / `## Response Expectations` / `## Scope`）を
> verbatim で使い、テストと doc を一致させる。

## T-01: リポジトリ直下に SECURITY.md を新規作成する（英語・4 節）

- [x] repo 直下に `SECURITY.md` を新規作成する。言語は英語（README と同じ）。
- [x] `## Supported Versions` 節: 「`0.x` line の最新 released minor のみが security fix を受ける。
  古い `0.x` minor は unsupported」を簡潔な表または文で示す。`0.2.0` のような特定 patch を **hardcode しない**
  （policy として表現する）。
- [x] `## Reporting a Vulnerability` 節: GitHub の Private vulnerability reporting（**Security tab →
  "Report a vulnerability"**）を**唯一の一次窓口**として案内する。脆弱性を public issue に書かないよう促す。
  email / バグバウンティ / 報奨金には**触れない**。本文に文字列 `Report a vulnerability` を含める。
- [x] `## Response Expectations` 節: 個人メンテナンスのため **best-effort** である旨を正直に書く
  （SLA は保証しない）。
- [x] `## Scope` 節: README の `## Assumptions & Supported Scope`（`### Trust model`）を参照する。
  本文に文字列 `trust model` を含める。次を例示する:
  - In scope: granted な GitHub scope を超える権限昇格 / secrets・credential（GitHub token 等）の意図しない
    漏洩 / 想定された worktree・権限境界を逸脱する挙動。
  - Out of scope: untrusted な第三者 `request.md` を流すことに起因する prompt injection（`request.md` は
    trusted input が前提）/ untrusted な commit history を持つ repo での実行に起因する問題（README で非推奨）。
- [x] 体裁は既存 README に合わせる（英語・`##` 見出し）。
- [x] README 既存内容と矛盾を発見しても `README.md` は編集せず、escalation で報告する。

**Acceptance Criteria**:
- `SECURITY.md` が repo 直下に存在し、英語で書かれている。
- `## Supported Versions` / `## Reporting a Vulnerability` / `## Response Expectations` / `## Scope` の
  4 見出しがすべて存在する。
- `## Reporting a Vulnerability` が GitHub PVR（Security tab → "Report a vulnerability"）を一次窓口として案内し、
  本文に `Report a vulnerability` を含む。
- `## Supported Versions` が「`0.x` の最新 minor のみ」を policy として示し、特定 patch を pin していない。
- `## Scope` が README trust model を参照（本文に `trust model` を含む）し、in-scope / out-of-scope を例示する。
- バグバウンティ・報奨金への言及がない。`README.md` は変更されていない。

## T-02: SECURITY.md の drift-guard テストを追加する

- [x] `tests/unit/docs/security-policy.test.ts` を新規追加する（vitest、`readme-pipeline-sync.test.ts` と同型）。
- [x] `path.resolve(process.cwd(), "SECURITY.md")` を解決し、`SECURITY.md` がファイルとして存在することを assert する。
- [x] SECURITY.md 本文が次の 4 見出しをすべて含むことを assert する:
  `## Supported Versions` / `## Reporting a Vulnerability` / `## Response Expectations` / `## Scope`。
- [x] 本文に `Report a vulnerability` を含むことを assert する（報告導線の drift 検出）。
- [x] 本文に `trust model` を **case-insensitive** で含むことを assert する（README trust model 参照の drift 検出）。
- [x] テストが repo root からの相対で SECURITY.md を解決し、環境非依存で動くこと。
- [x] 新規テストファイルが `eslint ./src ./tests --max-warnings 0`（lint ゲート）を満たすこと。

**Acceptance Criteria**:
- `SECURITY.md` を削除すると当該テストが落ちる。
- 4 見出しのいずれか / `Report a vulnerability` / `trust model` を欠くとテストが落ちる。
- `bun run test` で当該テストが green。
- `bun run lint` が当該テストファイルで warning / error を出さない。

## T-03: scope 不変条件と品質ゲートを確認する

- [x] `git diff` を確認し、追加ファイルが `SECURITY.md` と `tests/unit/docs/security-policy.test.ts` の
  2 件のみで、`README.md` および `src/` に差分がないことを確認する。
- [x] GitHub Private vulnerability reporting 機能の**有効化はコードで行わない**（repo Settings で人間が行う、
  Non-Goal）。この申し送りを PR 説明に記す。
- [x] `bun run typecheck` が green。
- [x] `bun run test` が green。
- [ ] 検証ゲート（`.specrunner/config.json` の `build → typecheck → test → lint`）が green。

**Acceptance Criteria**:
- `README.md` と `src/` に差分がない（追加は `SECURITY.md` と guard test のみ）。
- バグバウンティ・報奨金への言及がない。
- `bun run typecheck && bun run test` が green（build / lint を含む検証ゲートも green）。
- PVR の有効化が人間の責務である旨が PR 説明に申し送られている。
