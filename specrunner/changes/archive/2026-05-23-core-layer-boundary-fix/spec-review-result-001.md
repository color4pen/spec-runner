# Spec Review Result

- **verdict**: needs-fix
- **change**: core-layer-boundary-fix
- **type**: spec-change

---

## Summary

設計方針・全体構成は正確で、3 つの module-boundary 違反（core→cli / core→adapter / core→SDK）の分析と解決策は筋が通っている。delta spec の形式バリデーションも pass している。ただし 2 点の修正が必要。

---

## Findings

### Finding 1 [MUST FIX]: delta spec の Requirement タイトルが MODIFIED 後も semantically 誤った状態になる

**場所**: `specrunner/changes/core-layer-boundary-fix/specs/one-shot-query/spec.md`

**問題**:
delta spec が MODIFIED として処理する Requirement のヘッダーは baseline と完全一致させる規則があり、現状 `### Requirement: request-review は queryOneShot 経由で query() を呼び出す` のまま。しかし本文は「`OneShotQueryClient` port に依存する」と書き直されており、ヘッダーと本文が意味的に矛盾している。

`specrunner finish` 時に delta がマージされた後の baseline には、「queryOneShot 経由で呼び出す」というタイトルの Requirement が残り、その本文は「port に依存する」と規定する。将来の読者・エージェントに混乱を与え、spec の正確な自動検証も阻害する（シナリオが "queryOneShot が import されている" という旧形式のまま通るケースが想定外の挙動を引き起こす可能性）。

**修正方法**:
delta spec に `## Renamed` セクションを追加する。

```markdown
## Renamed

- "request-review は queryOneShot 経由で query() を呼び出す" → "reviewer / manager / generator は OneShotQueryClient port に依存する"
```

`## Requirements` 内の `### Requirement:` ヘッダーも renamed 後の名前に合わせて更新する（ルール上、MODIFIED は baseline と完全一致が必要なので、Renamed で新名前を登録してから新名前で書く）。

---

### Finding 2 [SHOULD FIX]: tasks.md Task 6 に原案・修正案が並存しており実装者を誤誘導するリスクがある

**場所**: `specrunner/changes/core-layer-boundary-fix/tasks.md` — Task 6

**問題**:
Task 6 には「6a / 6b（原案）」と「6a(revised) / 6b(revised) / 6c」が両方掲載されており、原案のチェックボックスは未チェックのまま残っている。

原案の 6a は以下のチェックを含む:
```
- [ ] `import { ClaudeCodeOneShotQueryClient } from "../../adapter/claude-code/one-shot-query-client.js"` を追加
```

これは `src/core/command/request-review.ts`（core 層）に adapter import を追加する指示であり、修正しようとしている module-boundary 違反を**新たに作り出す**内容。`-> **修正**:` のコメントで revised が優先されることは明示されているが、チェックボックスが残るため pipeline の implementer agent がそのまま消化するリスクがある。

**修正方法**:
原案の 6a / 6b の全チェックボックスを削除するか、テキスト全体を `~~取り消し線~~` またはコメントアウトで除去し、revised 版のみ残す。

---

### Finding 3 [INFO]: executeReview / executeCreate 内の config 読み込み移行が tasks に明示されていない

**場所**: `tasks.md` Task 6c

**観察**:
現状 `src/core/command/request-review.ts` / `request-create.ts` は内部で `loadConfig()` を呼んで config を取得し `runReview(content, config, cwd)` に渡している。revised 6a/6b が `client: OneShotQueryClient` 引数を追加した後、この内部 config 読み込みはデッドコードになる（client が config を内包するため）。

6c に「config 読み込みを executeReview/executeCreate から除去し、command-registry.ts で loadConfig + new ClaudeCodeOneShotQueryClient(config) を実行する」旨を明示するとよい。設計意図は design.md の D4 / Dependency Flow から読み取れるが、タスクレベルで抜けると実装時に config 読み込みが二重化する恐れがある。

blocking ではないが、tasks.md に 1 行補足することを推奨する。

---

## Security Considerations

本変更は pure architectural refactoring（依存方向の是正）であり、外部 API・入力処理・認証フローへの変更は一切ない。OWASP Top 10 に該当する新リスクはなし。`default fallback` の削除（`queryFn ?? query` の除去）は SDK が暗黙的に呼ばれる経路を塞ぐため、セキュリティポスチャーは向上する。

---

## What's Good

- 3 つの違反すべてに個別の原因分析と解決策が対応している（D1/D2/D3/D4）
- `OneShotQueryClient` interface 設計が既存 `SessionClient`/`AgentRunner` と同一粒度で、port 設計の一貫性を保っている
- `core/runtime/local.ts` の SDK 直 import を意図的に今回スコープ外とし別 issue に切り出した判断は適切（stale grep pattern の問題と混在させないため）
- regression test（Task 9）を architecture/test として独立させ、grep ベースで机上検証できる形にしている
- `wireProgressDisplay` factory を cli 層に置き、run / resume 両経路の重複を排除する設計が明確
- Tasks 11（typecheck & test green 確認）が最終タスクとして明示されている
