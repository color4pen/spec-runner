## ADDED Requirements

### Requirement: Vault Provisioning
The system SHALL create an Anthropic Vault for each user on first bootstrap, storing the `vault_id` in the `users` table for reuse.

#### Scenario: New vault created for user without vault_id
- **WHEN** `ensureVaultWithCredentials` is called for a user whose `vault_id` is null
- **THEN** the system calls `client.beta.vaults.create({ name: 'github-mcp-{userId}' })`, stores the returned vault ID in `users.vault_id`, and proceeds to credential registration

#### Scenario: Existing vault reused for user with vault_id
- **WHEN** `ensureVaultWithCredentials` is called for a user whose `vault_id` is non-null
- **THEN** the system skips vault creation and proceeds directly to credential registration using the existing vault_id

### Requirement: MCP Credential Registration
The system SHALL register the user's GitHub OAuth access token as an MCP credential in their Vault, targeting the GitHub Copilot MCP server.

#### Scenario: Credential registered successfully
- **WHEN** the system registers a credential in the Vault
- **THEN** it calls `client.beta.vaults.credentials.create(vaultId, { type: 'api_key', name: 'github-mcp', value: accessToken, mcp_server_url: 'https://api.githubcopilot.com/mcp' })`

#### Scenario: Credential conflict (409) resolved by re-registration
- **WHEN** credential creation returns HTTP 409 Conflict (credential for this MCP URL already exists)
- **THEN** the system lists existing credentials via `client.beta.vaults.credentials.list(vaultId)`, deletes the conflicting credential, and re-registers with the current access token

#### Scenario: MCP URL format
- **WHEN** registering an MCP credential
- **THEN** the `mcp_server_url` is exactly `https://api.githubcopilot.com/mcp` (no trailing slash)

### Requirement: Vault Resource for Session Creation
The system SHALL include the user's Vault as a resource when creating managed agent sessions that require MCP access.

#### Scenario: Vault included in session resources
- **WHEN** creating a bootstrap session via `createBoundSession`
- **THEN** the session creation includes `{ type: 'vault', vault_id: vaultId }` in the resources array alongside the GitHub repository resource

#### Scenario: Vault resource requires vault_id
- **WHEN** creating a session that requires Vault access and the user's `vault_id` is null
- **THEN** the system calls `ensureVaultWithCredentials` first to provision the Vault before session creation

### Requirement: Vault Credential Refresh on Bootstrap
The system SHALL update the Vault credential with the user's current OAuth token every time a bootstrap is initiated, ensuring the credential reflects the most recent token.

#### Scenario: Credential refreshed on each bootstrap
- **WHEN** `startBootstrap` is called
- **THEN** `ensureVaultWithCredentials` is called, which always attempts to register/re-register the credential with the current access token, so expired tokens are replaced

### Requirement: Module Design for Vault Operations
The `vault-actions.ts` module SHALL NOT use the `'use server'` directive. It is a pure library module whose functions accept explicit parameters (user DB ID, access token) rather than calling `getAuthenticatedUser()` internally. The caller (e.g., `startBootstrap` in `bootstrap-actions.ts`, which IS a `'use server'` module) is responsible for authentication via `getAuthenticatedUser()` before calling vault functions.

#### Scenario: Function signature with explicit parameters
- **WHEN** `ensureVaultWithCredentials` is called
- **THEN** its signature is `ensureVaultWithCredentials(userDbId: number, accessToken: string)`, where both values are obtained by the caller via `getAuthenticatedUser()`

#### Scenario: No 'use server' directive
- **WHEN** inspecting `src/lib/vault-actions.ts`
- **THEN** the file does NOT contain `'use server'` at the top

#### Scenario: Vault bound to specified user
- **WHEN** `ensureVaultWithCredentials` stores a vault_id
- **THEN** it stores the vault_id in the record for the `userDbId` passed by the caller. The caller guarantees that `userDbId` matches the authenticated user (via `getAuthenticatedUser().dbId`)
