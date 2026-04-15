## ADDED Requirements

### Requirement: Cloud Environment Creation
The application SHALL create cloud environments with OpenSpec CLI pre-installed.

#### Scenario: Environment created with cloud config
- **WHEN** the user initiates environment creation
- **THEN** the system calls `client.beta.environments.create()` with `type: 'cloud'`

#### Scenario: OpenSpec CLI installed via npm
- **WHEN** creating an environment
- **THEN** the config includes `packages: { npm: ['@fission-ai/openspec'] }`

### Requirement: Network Configuration
The environment SHALL use limited networking to balance security and functionality.

#### Scenario: Limited networking enabled
- **WHEN** creating an environment
- **THEN** the config includes `networking: { type: 'limited', allow_package_managers: true }`

#### Scenario: Package manager access allowed
- **WHEN** the environment initializes
- **THEN** npm can install packages despite limited networking

### Requirement: Environment Lifecycle Management
The application SHALL maintain environment instances for reuse across sessions.

#### Scenario: Environment ID stored
- **WHEN** an environment is created
- **THEN** the environment ID is stored in server-side memory

#### Scenario: Environment reused for multiple sessions
- **WHEN** creating a new session
- **THEN** the user can select an existing environment ID instead of creating a new one
