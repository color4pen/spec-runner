# Implementation Notes

## Status
- **result**: completed
- **tasks_completed**: 40/40

## Files Modified
- src/lib/db/schema.ts
- src/lib/session-actions.ts
- src/lib/actions.ts
- src/lib/repository-actions.ts (new)
- src/lib/request-actions.ts (new)
- src/app/api/sessions/[id]/stream/route.ts
- src/app/(protected)/repos/[owner]/[repo]/page.tsx
- src/app/(protected)/repos/[owner]/[repo]/_components/workspace-client.tsx
- src/app/_components/dashboard.tsx
- src/__tests__/schema-redesign.test.ts (new - 18 must TCs)
- src/__tests__/security-authed.test.ts
- src/__tests__/data-integrity.test.ts
- src/__tests__/api-contract.test.ts
- src/__tests__/security.test.ts
- drizzle/0001_db_schema_redesign.sql (new)
- drizzle/meta/0001_snapshot.json (new)
- drizzle/meta/_journal.json

## Blocked Tasks
なし

## Key Decisions
- drizzle-kit generate が TTY を要求しインタラクティブモードでないと動かないため、マイグレーション SQL を手動作成した。Drizzle の journal/snapshot も手動で追加。
- actions.ts の既存 SessionSummary（API セッション用）を ApiSessionSummary にリネームして、新しい SessionSummary（DB セッション用）との名前衝突を回避した。
- verifySessionAccessByManagedId を追加：SSE ストリームルートでは managed_session_id（文字列）でアクセスされるため、DB の id（数値）とは別の検索パスが必要だった。
- SQLite の TEXT 型は enum を DB レベルで強制しないため、CHECK 制約は Drizzle の enum 定義（TypeScript 型レベル）とアプリケーション層のバリデーションで担保。TC-012 はアプリ層バリデーションのテストとして実装。
- マイグレーション SQL で INSERT OR IGNORE + IF NOT EXISTS を使い冪等性を確保。2回実行テスト（TC-009）で検証済み。
