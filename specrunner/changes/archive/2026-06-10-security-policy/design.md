# Design: SECURITY.md を追加する（脆弱性報告窓口の明示）

## Context

公開リポジトリ `color4pen/spec-runner`（version `0.2.0`、0.x 系）に脆弱性報告の窓口定義がない。
本ツールは LLM agent に git worktree 内でコードを書かせ PR を作らせる性質上、secrets 漏洩・
権限昇格・prompt injection といった報告経路の明示が一般 OSS より価値が高い。GitHub は SECURITY.md が
あると Security タブと issue 作成画面に "Report a vulnerability" 導線を表示する。

### 確定した事実（追加内容の根拠）

- **repo slug**: `color4pen/spec-runner`（`git remote -v` の origin）。
- **現行 version**: `0.2.0`（`package.json` / `.release-please-manifest.json`、いずれも 0.x 系）。
- **SECURITY.md の不在**: repo 直下・`.github/`・`docs/` のいずれにも SECURITY.md は存在しない。
  GitHub はこの 3 箇所のどこに置いても Security タブの導線を出す。
- **README 言語**: 英語。
- **README の trust model**: `README.md` の `## Assumptions & Supported Scope` 節に文書化済み。
  - `### Trust model`: `request.md` は **trusted input**。request を書いた本人が PR を承認する solo 運用が前提。
    第三者が著した `request.md` をそのまま流す運用は supported scope 外。
  - `### Commit history trust`: 外部コントリビュータのいる repo では git log / diff が agent prompt に入るため、
    untrusted な commit history を持つ repo での実行は非推奨。
- **docs drift-guard の先例**: `tests/unit/docs/`（`readme-pipeline-sync.test.ts` /
  `readme-resume-command.test.ts`）に、repo root のドキュメントを `fs` で読んで必須要素の存在を assert する
  vitest が存在する。
- **検証ゲート**: `.specrunner/config.json` の `verification.commands` で `build → typecheck → test → lint`
  を実行する。lint は `eslint ./src ./tests --max-warnings 0` であり、新規テストファイルも lint 対象になる。

## Goals / Non-Goals

**Goals**:

- repo 直下に英語の `SECURITY.md` を新規追加する。
- 含む内容を 4 節に対応させる: Supported Versions / Reporting a Vulnerability / Response Expectations / Scope。
- 報告の一次窓口を GitHub Private vulnerability reporting（Security タブ → "Report a vulnerability"）に統一する。
- 応答方針を個人メンテナンスの **best-effort** として正直に記す。
- Scope を README の trust model に錨を打って記述し、その前提の範囲内で何が脆弱性に該当 / 非該当かを示す。
- SECURITY.md の存在と必須節を守る軽量 drift-guard テストを 1 件追加し、`typecheck && test`（および
  build / lint の検証ゲート）を green に保つ。

**Non-Goals**:

- GitHub Private vulnerability reporting 機能の **有効化**（repo Settings、人間が行う）。
- バグバウンティ・報奨金への言及。
- `README.md` の変更（参照はするが 1 行も編集しない）。
- email など GitHub PVR 以外の報告チャネルの新設。
- security policy のコードによる強制（CI ゲート新設や実行時検証の追加）。

## Decisions

### D1: SECURITY.md を repo 直下に置く

GitHub が認識する 3 箇所（root / `.github/` / `docs/`）のうち **root** を選ぶ。

**Rationale**: request 要件が「リポジトリ直下」を明示している。root は `ls` で直接見え、最も発見されやすい。
**Alternatives considered**: `.github/SECURITY.md` — GitHub の導線表示は同じだが request 指定に反するため却下。

### D2: SECURITY.md を 4 節で構成する

`## Supported Versions` / `## Reporting a Vulnerability` / `## Response Expectations` / `## Scope` の 4 節。
各節は request 要件 1 の 4 項目（サポートバージョン / 報告方法 / 応答の目安 / スコープ）に 1:1 対応する。

**Rationale**: 受け入れ基準「報告方法・対応方針・スコープを含む」を節構造で機械検証可能にする。
固定見出しにすることで drift-guard テストの assertion 対象が安定する。
**Alternatives considered**: 散文 1 節にまとめる案 — 必須要素の有無をテストで検証しづらく、欠落を見落とすため却下。

### D3: 報告窓口は GitHub Private vulnerability reporting のみとし、代替チャネルを設けない

`## Reporting a Vulnerability` 節は Security タブ → "Report a vulnerability" を**唯一の一次窓口**として案内し、
脆弱性を public issue に書かないよう促す。email 等の代替窓口は設けない。

**Rationale**: PVR は報告を private に保て、solo maintainer が別途 inbox を運用せずに済む。request もこれを
一次窓口と明示している。機能の有効化自体は人間が repo Settings で行う（Non-Goal）。
**Alternatives considered**: email fallback を併記 — 公開 email の運用と spam 受信が必要で solo 運用の負担になり、
request も求めていないため却下。
**Note**: PVR が未有効のときの挙動には触れない。有効化は人間の責務であり、SECURITY.md は有効化済み前提で書く
（この申し送りは PR 説明 / T-03 で行う）。

### D4: Supported Versions は「0.x の最新 minor のみ」を policy 文として書き、特定 patch を hardcode しない

「Only the latest released minor of the `0.x` line receives security fixes; older `0.x` minors are unsupported」
を簡潔な表または文で示す。`0.2.0` のような正確な値を pin しない。

**Rationale**: `package.json` の version は頻繁に上がるため、patch を hardcode すると docs が即陳腐化する。
policy として表現すれば version bump で腐らない。
**Alternatives considered**: `0.2.x` を明記 — 次 minor で古くなり保守負担が生じるため却下。

### D5: Scope は README の trust model に錨を打ち、前提内 / 前提外を例示する

`## Scope` 節は README の `## Assumptions & Supported Scope`（`### Trust model` / `### Commit history trust`）を
参照したうえで、判断境界を例示する:

- **In scope**（trust model の前提内で守るべき境界の破れ）の例:
  - granted な GitHub scope を超える権限昇格
  - secrets / credential（GitHub token 等）の意図しない漏洩・exfiltration
  - 想定された worktree / 権限境界を逸脱する挙動
- **Out of scope**（trust model 上 supported でない前提に依存するもの）の例:
  - untrusted な第三者の `request.md` を流すことに起因する prompt injection（`request.md` は trusted input が前提）
  - untrusted な commit history を持つ repo での実行に起因する問題（README で非推奨と明記済み）

**Rationale**: trust model を無視して「あらゆる prompt injection が脆弱性」と書くと README と矛盾し、報告者と
維持者の期待がずれる。前提内 / 前提外を例示すれば該当判断の境界が伝わる。最終的な文言と該当判断は implementer
（+ 人間レビュー）が README と整合する形で確定する。
**Alternatives considered**:
- Scope を書かず報告窓口だけ示す案 — 受け入れ基準「スコープを含む」を満たさず却下。
- request 背景が挙げる prompt injection を無条件に in-scope と書く案 — README trust model と矛盾するため却下。

### D6: SECURITY.md の drift-guard テストを 1 件追加する

`tests/unit/docs/security-policy.test.ts` に、SECURITY.md の存在・4 節見出しの存在・報告窓口と trust model 参照を
示すキーフレーズの存在を assert する vitest を追加する（`readme-pipeline-sync.test.ts` と同型）。

**Rationale**: 受け入れ基準の `test green` を docs 追加に対して意味あるゲートにし、将来の削除 / 節欠落 / 報告窓口の
書き換えを機械検出する。本 repo は docs drift-guard を敷く文化がある（先例 2 件）。
**Alternatives considered**: テストを追加せず review 目視に委ねる案 — 将来の silent regression を許し、
`test green` が docs 変更に対して無内容になるため却下。テスト対象は存在 + 見出し + キーフレーズに限定し、
README 全文 snapshot のような脆い結合は持たせない。

## Risks / Trade-offs

- [Risk] PVR が repo Settings で未有効のまま SECURITY.md だけ存在し、報告導線が機能しない
  → Mitigation: 有効化は Non-Goal（人間が行う）。SECURITY.md は有効化済み前提で書き、T-03 / PR 説明で
    「人間が repo Settings で Private vulnerability reporting を有効化する必要」を申し送る。
- [Risk] Scope 節の文言が README trust model と微妙にずれて矛盾する
  → Mitigation: D5 のとおり README の節を参照し、implementer は README と突き合わせて整合を確認する。
    矛盾を発見しても README は編集せず（Non-Goal）、escalation で報告する。
- [Risk] docs 変更に guard test を足すのは scope 過剰では
  → Mitigation: 先例（`readme-pipeline-sync.test.ts`）と同型・最小（存在 + 見出し + キーフレーズ）に限定し、
    外部 source への結合を持たせない。新規テストファイルは lint（`--max-warnings 0`）を満たす。
- [Risk] Supported Versions の policy 文が将来の 1.0 到達で陳腐化する
  → Mitigation: `0.x` line を明示した policy 文にとどめ、patch を pin しない。1.0 到達時は別 change で更新する。

## Open Questions

- なし（docs 追加 + 最小 guard test。設計判断は D1–D6 で確定済み）。
