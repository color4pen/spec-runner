# staging containment の残口封じ — staged バイトサイズ閾値ガードと生成物衛生規律

## Meta

- **type**: spec-change
- **slug**: staging-containment-followups
- **base-branch**: main
- **adr**: false

## 背景

guarded staging（`maxStagedFiles` / `stagingExcludePatterns`）は、大量の生成物が staged される事故を file 数の閾値で commit 前に停止する。しかし実事故の失敗様式は「巨大 pack の push が HTTP 400 で失敗し、pipeline に回復手段が無い」であり、これは file 数だけでなく総バイト量でも到達する。少数の巨大ファイル（例: 100 files × 50MB のバイナリ）は file 数 guard を素通りし、同じ回復不能地点に至る。push 側での救済（buffer 拡大・retry 強化）は「巨大 pack の push 成功」という誤った結果を助けるため採らない。pre-commit 停止が唯一の防御である以上、閾値はバイト量にも必要である。

もう一つの残口は上流にある。生成物が working tree に入らなければ guard の出番自体が無いが、実装系 agent の prompt には build 生成物・scratch ファイルの置き場所に関する規律が一切存在しない。build を実行する step（implementer / build-fixer / code-fixer）が生成物を repo 直下に落とすと、untracked mass として staging 対象に浮上する。

両者は同一の封じ込め設計（guarded staging）の残課題であり、機械 guard + prompt 規律の二層で塞ぐ。

## 現状コードの前提

- 容量系 guard は file 数のみ: `commit-push.ts` の guarded synthesis 分岐で exclusion 適用後・`git add` 前に `resolveMaxStagedFiles` と比較し、超過なら `stagingLimitExceededError` で halt（`src/core/step/commit-push.ts:619-631`、error は `src/errors.ts:532-550`）
- guard 判定点で得ているのは path のみ。`getWorktreeChangedPaths`（`src/core/step/commit-push.ts:113-170`）は `git status --porcelain -z --no-renames --untracked-files=all` の出力からサイズ情報を持たない
- push は `pushOnly`（`src/core/step/commit-push.ts:912-934`）で 1 retry（5 秒）のみ。HTTP 400 / pack サイズの特別扱いは無く、二度失敗で `pushFailedError`（`src/errors.ts:273-279`）。pack 生成後の回復経路は存在しない
- guard の resolver / 既定値は `src/core/step/staging-containment.ts`（`DEFAULT_MAX_STAGED_FILES = 2000`、resolver 群 :39-59）。config schema は `src/config/schema/types.ts:247-262` + `src/config/schema/validation.ts:241-252`、adopter 向け docs は `docs/configuration.md:411-438`
- prompt に生成物・scratch の規律は無い。共有 fragment `COMMIT_DISCIPLINE`（`src/prompts/fragments.ts:16-20`）は git 実行禁止のみ、implementer の write-set（`src/prompts/implementer-system.ts:26-31`）はスコープ制約のみ。`COMMIT_DISCIPLINE` は implementer / build-fixer / code-fixer の system prompt が共有している
- 既存 guard のテスト: `src/core/step/__tests__/commit-push-guarded-staging.test.ts`（TC-004 が超過 halt で add/commit/push 不実行を assert）、`src/core/step/__tests__/staging-containment.test.ts`（resolver / error 文言）、`src/config/__tests__/staging-config-validation.test.ts`（schema）

## 要件

1. **staged バイトサイズ閾値 guard**: 新 config `maxStagedBytes`（既定 50MB = 52,428,800）を追加する。guarded staging の判定点（exclusion 適用後・`git add` 前）で staging 対象 path の worktree 上のファイルサイズ合計を測定し、閾値超過なら commit 前に halt する。既定値の根拠: 正当な source 変更が非圧縮 50MB を超えることは実質なく、超過はほぼ生成物混入である。測定は非圧縮バイトであり pack サイズを過大評価する側に倒れる（保守的 = 安全側）
2. **測定の縮退規律**: サイズ測定は staging 対象の各 path の lstat による。削除予定 path（worktree に存在しない）は 0 として扱う。それ以外の測定失敗を guard 素通り（fail-open）にしない
3. **halt メッセージ**: 総バイト数・閾値・サイズ上位の内訳（file または第一階層 directory 単位）・対処（`stagingExcludePatterns` / `.gitignore` / 閾値引き上げ）を含める。`stagingLimitExceededError` と同じ escalation 経路・様式
4. **config の一式**: schema types / validation / `staging-containment.ts` の resolver（`resolveMaxStagedFiles` の mirror）/ `docs/configuration.md` の Guarded staging 節への追記
5. **生成物衛生規律（prompt 層)**: 共有 fragment `COMMIT_DISCIPLINE` に追加する — build・生成物・scratch ファイルを repo の tracked 対象になる場所へ出力しない。build 出力先が repo 内に固定されている場合は `.gitignore` で ignore されていることを確認し、されていなければ `.gitignore` への追記を変更に含める。一時ファイルは ignore 済みの場所に置く。implementer / build-fixer / code-fixer の全 guarded producer step に一箇所で効かせる
6. **file 数 guard との独立性**: 両 guard は独立に判定される（どちらか一方の超過で halt）。既存の file 数 guard の挙動・既定値は変更しない

## スコープ外

- push 経路の変更（`http.postBuffer` 調整・retry 強化・HTTP 400 の特別扱い）— 巨大 pack の push 成功は事故の成功化であり望まない
- pack 分割 push 等の回復機構
- scoped staging（guarded でない分岐）への guard 追加
- 既存 `maxStagedFiles` / `stagingExcludePatterns` の挙動変更

## 受け入れ基準

- [ ] file 数閾値以下 × バイト閾値超過の staged set で、`git add` / commit / push が一切実行されずに halt することをテストで固定する（TC-004 と同型）。破壊確認込み
- [ ] バイト閾値以下（file 数も閾値以下）の staged set が従来どおり commit + push に進むことをテストで固定する
- [ ] 削除予定 path（worktree に不存在）が 0 バイト扱いで guard を誤発火させないことをテストで固定する
- [ ] halt メッセージに総バイト数・閾値・サイズ内訳・対処が含まれることをテストで固定する
- [ ] `maxStagedBytes` の schema validation（正の整数のみ許容）をテストで固定する
- [ ] `COMMIT_DISCIPLINE` の生成物衛生規律の文言存在をテストで固定する（prompt contract テストの様式）
- [ ] 既存テスト（guarded staging の TC-001〜TC-020 含む）は無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用: pre-add の fail-closed guard の mirror 構成** — file 数 guard と同一判定点・同一 escalation 様式。pack が生成される前に停止することが唯一の防御である（push 側に回復経路が無いことは確認済み）
- **採用: 非圧縮バイトでの測定** — `git add` 前に lstat で測れる唯一の値であり、pack サイズを過大評価する側（早めに halt する側）に倒れる。圧縮後サイズの精密測定は add 後にしか得られず、object store への巨大書き込みを許してしまう
- **却下: push の postBuffer 自動調整 / retry 強化** — 巨大 pack を push できてしまうことは事故の解決ではなく成功化。実事故で手動 postBuffer 拡大により復旧した事実は「その pack を push すべきだった」ことを意味しない
- **却下: push エラー（HTTP 400）の検知・特別扱い** — pack 生成後では手遅れ。事前閾値のみが有効
- **却下: prompt 規律のみ（機械 guard なし）** — prompt 指示は agent の裁量で縮退する。機械の歯が主、prompt は発生源対策の従
