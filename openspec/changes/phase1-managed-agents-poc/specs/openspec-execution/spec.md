## ADDED Requirements

### Requirement: OpenSpec CLI Availability
The OpenSpec CLI SHALL be accessible within the agent session environment.

#### Scenario: OpenSpec command executable
- **WHEN** the agent executes a bash command
- **THEN** `openspec` is available in the PATH

#### Scenario: OpenSpec version verification
- **WHEN** the agent runs `openspec --version`
- **THEN** the command succeeds and returns the installed version

### Requirement: OpenSpec Command Execution
The agent SHALL execute OpenSpec CLI commands within the session.

#### Scenario: List changes command
- **WHEN** the user sends a message requesting to list changes
- **THEN** the agent executes `openspec list` and returns the output

#### Scenario: Command output displayed
- **WHEN** an OpenSpec command completes
- **THEN** the command output is included in the agent's response message

### Requirement: File Operations on Mounted Repository
The agent SHALL read and write files in the mounted GitHub repository.

#### Scenario: Read repository file
- **WHEN** the agent needs to read a file from the mounted repository
- **THEN** the agent uses file read tools to access files at the mount path

#### Scenario: Write repository file
- **WHEN** the agent creates or modifies files
- **THEN** changes are written to the mounted repository directory

### Requirement: OpenSpec Workflow Integration
The agent SHALL support OpenSpec workflow commands within the session.

#### Scenario: Create new change
- **WHEN** the user requests to create a change
- **THEN** the agent executes `openspec new change <name>` and confirms creation

#### Scenario: Generate artifacts
- **WHEN** the user requests artifact generation
- **THEN** the agent executes `openspec instructions <artifact>` and creates the artifact file
