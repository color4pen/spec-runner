# Design: rules-md-injection

## Context

spec-runner pipeline で ADR 配置事故が 4 件連続発生（PR #339, #343, #344 + 過去 1 件）。全て `docs/adr/` への誤配置で、正規 path `specrunner/adr/{YYYY-MM-DD}-{slug}.md` を無視している。

PR #342 で `SPEC_RUNNER_COMMON_CONTEXT` を全 agent に system prompt 強制 prepend する対策を投入済み。しかし system prompt 内の static 規律は agent にとって「与えられた前提（given）」であり、業界慣習（MADR の `docs/adr/NNN-...`）が context で発火すると上書きされやすい。

## Goals

- **ADR 配置事故の構造的排除**: 規律を agent が能動的に取得する形式に移行し、context 内での重みを増す
- **fragments.ts の肥大化解消**: `SPEC_RUNNER_COMMON_CONTEXT`（~70 行）等の static 規律を外部ファイルに分離
- **Self-contained change folder**: rules.md も change folder に配置し、agent の自然な探索範囲内に規律を存在させる

## Non-Goals

- ADR 配置場所自体の仕様変更（既存 path 維持）
- post-process rename / tool 化 / session resume + correction（別議論）
- 他 step path 強制への横展開（ADR / authority / delta の既存範囲のみ）

## Decisions

### D1: acquired information 方式の採用

**決定**: 規律を system prompt への static 注入から、`rules.md` ファイルへの Read tool 取得に移行する。

**理由**: Anthropic prompt engineering guide の経験則として、agent が能動的に取得した情報は context 内で「自分で読んだ事実」として扱われ、static 注入（= given）より印象が強い。4 件連続事故の根本原因は given vs acquired の認知差。

**Alternative: MUST / CRITICAL 強調の強化**
- Claude 4.x で aggressive language は dial back 推奨、逆効果のリスク
- 5-10% 程度の改善にしかならない

**Alternative: tool 化（write_adr toolHandler）**
- 100% 強制できるが managed 限定。local / codex runtime で効かない
- 本 project は dual runtime が前提

### D2: buildSystemPrompt の簡素化

**決定**: `buildSystemPrompt` から `SPEC_RUNNER_COMMON_CONTEXT` の自動 prepend を廃止。`SPEC_RUNNER_COMMON_CONTEXT` / `AUTHORITY_SPEC_GUARD` / `DELTA_SPEC_FORMAT` は fragments.ts から削除し、内容は `specrunner/rules.md` に集約する。

`buildSystemPrompt` は base + fragments の join のみを担当する。

**理由**: rules.md に移行した内容を system prompt にも重複注入すると、context window の無駄遣いになる。agent は rules.md を Read で取得するため、system prompt 側の注入は不要。

**残す fragment**: `COMMIT_DISCIPLINE`（振る舞いの具体ルール、Read させるものではない）、`PIPELINE_RULES`（review skill 専用 scoring rule、規律ではない）。

### D3: identity priming パターン

**決定**: 各 agent system prompt の冒頭に以下の定型句を追加:

```
あなたは spec-runner pipeline のステップ agent（{step name}）です。
作業開始前に rules.md（= `specrunner/changes/<slug>/rules.md`）を Read tool で読み、規律を確認してから着手してください。
```

**理由**: identity 固定（= 「あなたは spec-runner の agent」）と規律ファイルへの行動拘束を組み合わせることで、業界慣習が発動した瞬間に identity が打ち消す心理構造を作る。Claude 4.x で aggressive language を避けつつ強い role 固定が効く。

### D4: worktree setup での rules.md コピー

**決定**: `local.ts` / `managed.ts` の `setupWorkspace` で、request.md コピーと同じ機構で `specrunner/rules.md` → `specrunner/changes/<slug>/rules.md` にコピーする。

**理由**: run 開始時に rules.md が change folder に配置されることで、agent が `specrunner/changes/<slug>/` を探索する際に自然に rules.md を発見できる。request.md コピーと同じ commit に含める。

**Alternative: rules.md を固定 path から Read させる**
- `specrunner/rules.md` を直接 Read させることも可能だが、change folder にコピーする方が agent の探索パターンと整合する
- change folder が self-contained になる利点

### D5: delta spec への影響範囲

**決定**: `prompt-fragment-registry` capability の baseline spec を delta spec で更新する。

**変更内容**:
- `SPEC_RUNNER_COMMON_CONTEXT` / `AUTHORITY_SPEC_GUARD` / `DELTA_SPEC_FORMAT` の fragments.ts からの削除を反映
- `buildSystemPrompt` の自動 prepend 廃止を反映
- rules.md Read 指示の新しい構造的保証を追加
- fragment-coverage / common-context-catch test の変更を反映

## Risks / Trade-offs

### [Risk] rules.md を Read しない agent が出現する
- **Mitigation**: system prompt の冒頭定型句で Read 指示 + 静的 unit test で全 agent prompt が Read 指示を含むことを assert
- 完全な保証ではないが、system prompt 内の static 注入よりは強い（identity priming + acquired information の二重効果）

### [Risk] rules.md の内容が陳腐化する
- **Mitigation**: rules.md はプロジェクトルート管理。変更は通常の PR フローで行う

### [Risk] context window 使用量の増加
- **Mitigation**: rules.md は agent が Read で取得するため、system prompt から削除した分（SPEC_RUNNER_COMMON_CONTEXT + AUTHORITY_SPEC_GUARD + DELTA_SPEC_FORMAT）と rules.md Read の分が概ね相殺される。net increase はほぼゼロ

### [Trade-off] 100% 保証ではない（93-97% 推定）
- tool 化（100%）を諦めて dual runtime 互換性を取った設計判断
- 残りのリスクは静的 unit test + 将来の post-process rename で軽減

### [Risk] 静的 unit test の限界（Finding #3）
- `rules-md.test.ts` / `common-context-catch.test.ts` は **入力側の構造的ガード**（system prompt や rules.md の静的内容）を検証するものであり、**agent が実際に出力する design.md 内の path 文字列**は検証対象外
- 実際の事故（PR #339 / #343 / #344）は agent の出力中に `docs/adr/` が現れることで発生しており、静的テストだけでは catch できない
- **受容判断**: LLM の出力挙動を静的テストで保証することは原理的に不可能。本変更は「入力ガード」としての位置づけであり、identity priming + acquired information の二重効果による確率的な改善を狙うもの。完全な保証には post-process rename（別 PR）が必要

### [Risk] `changes/<slug>/rules.md` がデザイン step から上書き可能（Finding #4）
- コピー先 `specrunner/changes/<slug>/rules.md` は design step の write 可能パス内（change folder）に存在する
- buggy または悪意ある design step agent が同一 job 内の rules.md を上書きすると、後続 step の Read 指示が機能しなくなる可能性がある
- **受容判断**: cross-job への影響は worktree 分離によって防がれており、最悪ケースは同一 job 内のみ。spec-runner の agent は外部入力を直接 write することはなく、脅威モデルは悪意あるユーザーではなく buggy agent に限定される。許容リスクとして受容し、別途 post-process validation で軽減を検討
