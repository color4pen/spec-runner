// Vault lifecycle management — no 'use server' directive.
// Pure lib module. Callers must pass authenticated user IDs and tokens.

import { getAnthropicClient } from './anthropic';
import { getDb } from './db';
import { users } from './db/schema';
import { eq } from 'drizzle-orm';

const GITHUB_MCP_URL = 'https://api.githubcopilot.com/mcp';
const GITHUB_MCP_DISPLAY_NAME = 'github-mcp';

/**
 * Ensure a Vault exists for the user and MCP credentials are registered.
 * - If user has no vault_id: creates a new Vault and saves vault_id to users table.
 * - If user already has vault_id: reuses the existing Vault.
 * - Registers GitHub MCP credentials. On 409 Conflict: deletes existing and re-registers.
 *
 * @param userDbId - The user's database ID (from getAuthenticatedUser().dbId)
 * @param accessToken - The user's GitHub OAuth access token
 * @returns The vault_id that was used/created
 */
export async function ensureVaultWithCredentials(
  userDbId: number,
  accessToken: string
): Promise<string> {
  const db = getDb();
  const client = getAnthropicClient();

  // Look up current vault_id
  const [user] = await db
    .select({ vaultId: users.vaultId })
    .from(users)
    .where(eq(users.id, userDbId));

  if (!user) {
    throw new Error(`User not found: ${userDbId}`);
  }

  let vaultId: string;

  if (user.vaultId) {
    // Reuse existing Vault
    vaultId = user.vaultId;
  } else {
    // Create a new Vault
    const vault = await client.beta.vaults.create({
      display_name: `user-${userDbId}-vault`,
    });
    vaultId = vault.id;

    // Save vault_id to users table
    await db
      .update(users)
      .set({ vaultId })
      .where(eq(users.id, userDbId));
  }

  // Register MCP credentials (always refresh to ensure latest token)
  await addMcpCredential(vaultId, accessToken);

  return vaultId;
}

/**
 * Register GitHub MCP credentials into the Vault using static_bearer auth.
 * On 409 Conflict: clears existing credential and re-registers.
 */
async function addMcpCredential(
  vaultId: string,
  accessToken: string
): Promise<void> {
  const client = getAnthropicClient();

  try {
    await client.beta.vaults.credentials.create(vaultId, {
      auth: {
        type: 'static_bearer',
        token: accessToken,
        mcp_server_url: GITHUB_MCP_URL,
      },
      display_name: GITHUB_MCP_DISPLAY_NAME,
    });
  } catch (error: unknown) {
    // 409 Conflict: credential already exists — clear and re-register
    if (isConflictError(error)) {
      await clearAndReaddCredential(vaultId, accessToken);
    } else {
      throw error;
    }
  }
}

/**
 * Delete all existing credentials for the MCP URL and re-register.
 * Used for 409 Conflict resolution.
 * Note: Vault is write-only — credential values cannot be read back.
 */
async function clearAndReaddCredential(
  vaultId: string,
  accessToken: string
): Promise<void> {
  const client = getAnthropicClient();

  // List existing credentials — Vault is write-only, so we cannot read values
  // SDK returns a PageCursor, must iterate with for-await
  for await (const cred of client.beta.vaults.credentials.list(vaultId)) {
    if (cred.auth.mcp_server_url === GITHUB_MCP_URL) {
      await client.beta.vaults.credentials.delete(cred.id, {
        vault_id: vaultId,
      });
    }
  }

  // Re-register with the new token
  await client.beta.vaults.credentials.create(vaultId, {
    auth: {
      type: 'static_bearer',
      token: accessToken,
      mcp_server_url: GITHUB_MCP_URL,
    },
    display_name: GITHUB_MCP_DISPLAY_NAME,
  });
}

/**
 * Type guard to detect 409 Conflict errors from Anthropic SDK.
 */
function isConflictError(error: unknown): boolean {
  if (error instanceof Error) {
    // Anthropic SDK errors expose status code
    const apiError = error as Error & { status?: number };
    if (apiError.status === 409) {
      return true;
    }
    // Fallback: check message
    if (error.message.includes('409') || error.message.toLowerCase().includes('conflict')) {
      return true;
    }
  }
  return false;
}
