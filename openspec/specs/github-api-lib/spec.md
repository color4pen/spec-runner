## Purpose

Wrapper utilities around GitHub REST API for branches, file contents, and pull requests.

## Requirements
### Requirement: Branch File Listing
The github-api.ts module SHALL provide a function to list files in a directory on a specific branch.

#### Scenario: List directory contents on branch
- **WHEN** `getDirectoryContents(token, owner, repo, path, ref)` is called with a valid branch reference
- **THEN** the system calls GitHub Contents API `GET /repos/{owner}/{repo}/contents/{path}?ref={ref}` and returns an array of file/directory entries with name, path, type, and size

#### Scenario: Directory not found on branch
- **WHEN** the specified path does not exist on the branch
- **THEN** the function returns an empty array (does not throw for 404)

#### Scenario: Branch not found
- **WHEN** the specified branch reference does not exist
- **THEN** the function returns an empty array (does not throw for 404)

#### Scenario: Directory entry limit
- **WHEN** a directory contains more than 1000 entries
- **THEN** the GitHub Contents API returns only the first 1000 entries. For change folder usage this limit is not expected to be reached; if needed in the future, the implementation should switch to the Git Trees API

### Requirement: Branch File Content Retrieval
The github-api.ts module SHALL provide a function to retrieve the content of a single file on a specific branch.

#### Scenario: Get file content on branch
- **WHEN** `getFileContent(token, owner, repo, path, ref)` is called with a valid file path and branch reference
- **THEN** the system calls GitHub Contents API `GET /repos/{owner}/{repo}/contents/{path}?ref={ref}`, decodes the Base64 `content` field, and returns the decoded string

#### Scenario: File not found on branch
- **WHEN** the specified file does not exist on the branch
- **THEN** the function returns null (does not throw for 404)

#### Scenario: File content encoding
- **WHEN** the GitHub API returns file content
- **THEN** the function decodes the `content` field from Base64 encoding (GitHub's default) and returns the UTF-8 string
