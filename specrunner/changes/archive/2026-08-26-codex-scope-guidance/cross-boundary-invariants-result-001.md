# cross-boundary-invariants Review — codex-scope-guidance — iter 1

<!-- verdict は CLI が typed findings から導出するため、この report には記載しない。 -->

## 変更境界

`git diff main...HEAD --stat` と changed-file list を確認した。実装差分は Codex adapter の
main-turn prompt 組み立て、adapter-local 定数、およびそのテストに限定されている。
`src/adapter/shared/`、`src/adapter/claude-code/`、`src/adapter/managed-agent/`、
`src/core/pipeline/`、`specrunner/reviewers/` には差分がない。

## 新しい経路と隣接不変条件

### 1. Provider dispatch → Codex main work turn

`DispatchingAgentRunner.run()` は既存どおり resolved model の provider が `openai` の場合だけ
`CodexAgentRunner` に routing する。guidance 定数の参照は `src/adapter/codex/` 内に閉じており、
shared builder や Claude / managed adapter に伝播する経路はない。従って「Claude prompt は
byte-identical のまま」という未変更側の前提を保つ。

### 2. Prompt section ordering → structured completion contract

新しい連結順は `baseFullPrompt` → `promptRulesSection` → `scopeGuidanceSection` →
`buildMainTurnCompletionInstruction()` である。`reportTool` がある場合も completion instruction が
最後の directive のままなので、未変更の `outputSchema`、JSON extraction、completion retry が置く
「main turn の末尾で structured output を要求する」前提を破らない。`reportTool` がない場合は guidance
が末尾となり、既存の artifacts / touched-files / resume / runtime-instructions の相対順は変わらない。

### 3. Resume success / resume failure fallback

resume 成功時と resume 失敗後の fresh-thread fallback は、いずれも同じ `fullPrompt` を main turn に渡す。
guidance 追加によって thread 選択、retry counter、timeout/watchdog の初期化条件は変化しない。
resume context と guidance の組み合わせも対象テストで実行されている。

### 4. Main turn → completion retry / post-work / output-verification repair

guidance は `fullPrompt` にだけ含まれる。completion retry は
`buildCompletionRetryPrompt()`、post-work は policy の個別 prompt、repair は
`outputVerification.buildPrompt()` を同じ active thread に送る既存経路であり、いずれも guidance を
再連結しない。同一 thread が main-turn context を保持するという既存前提と整合し、retry の狭い JSON
contractも変化しない。main response が非 JSON の実行列で、2 turn 目に guidance が含まれないことを確認した。

### 5. Reviewer finding routing / observations channel

guidance が案内する observation は既存の report schema に定義済みであり、findings と異なって verdict
routing および findings ledger の対象外である。新しい出力種別や pipeline transition は追加されていない。
したがって speculative issue を observation に落とす新しいモデル挙動は、未変更の reviewer-chain と
ledger が既に置いている分類前提の範囲内で処理される。

## Findings

なし。変更していないコードの不変条件を破る具体的な実行列は構成できなかった。

## Observations

なし。

## Evidence

- checked: 10
- skipped: 0
- unverified: 0
- 対象テスト: scope-guidance injection、resume、artifact byte-identity、provider isolation、
  completion contract、prompt-rules ordering の 6 files / 39 tests が pass
- `git diff --check main...HEAD` pass

