# Sentry MCP Server

## @zereight/sentry-server

[![smithery badge](https://smithery.ai/badge/@zereight/sentry-server)](https://smithery.ai/server/@zereight/sentry-server)

Sentry MCP(Model Context Protocol) Server. Allows interaction with the Sentry API to fetch issue and event details.

## Usage

### Using with Roo Code, Cline, etc.

Add the following configuration to your MCP settings file (e.g., `mcp_settings.json`):

```json
{
  "mcpServers": {
    "sentry-server-npm": {
      "command": "npx",
      "args": [
        "-y",
        "@zereight/sentry-server"
      ],
      "env": {
        "SENTRY_AUTH_TOKEN": "YOUR_SENTRY_AUTH_TOKEN",
        "SENTRY_BASE_URL": "YOUR_SENTRY_BASE_URL" // Optional: Defaults to https://sentry.io
      },
      "disabled": false
    }
  }
}
```

Replace `"YOUR_SENTRY_AUTH_TOKEN"` with your actual Sentry Auth Token. You can generate one in your Sentry User Settings > Auth Tokens.

### Using with Cursor (or direct CLI)

When using with Cursor or running directly, you can set up environment variables and run the server as follows:

```bash
env SENTRY_AUTH_TOKEN=YOUR_SENTRY_AUTH_TOKEN SENTRY_BASE_URL=YOUR_SENTRY_BASE_URL npx @zereight/sentry-server
```

- `SENTRY_AUTH_TOKEN` (Required): Your Sentry authentication token.
- `SENTRY_BASE_URL` (Optional): The base URL for your Sentry instance (e.g., for self-hosted). Defaults to `https://sentry.io`.

## Tools 🛠️

1.  **`get_sentry_issue`**
    - Fetches details for a specific Sentry issue. ℹ️
    - Inputs:
        - `issue_id_or_url` (string, required): The Sentry issue ID or the full URL of the issue page.
    - Returns: Detailed information about the issue (JSON string).

2.  **`list_organization_projects`**
    - Lists all projects for the configured Sentry organization. 📂
    - Inputs: None
    - Returns: A list of project objects (JSON string).

3.  **`list_project_issues`**
    - Lists issues for a specific project, with optional filtering. 🐛
    - Inputs:
        - `organization_slug` (string, required): The slug of the organization the project belongs to.
        - `project_slug` (string, required): The slug of the project to list issues for.
        - `query` (string, optional): Sentry search query to filter issues (e.g., "is:unresolved", "assignee:me").
        - `statsPeriod` (string, optional): Time period for statistics (e.g., "24h", "14d", "auto").
        - `cursor` (string, optional): Pagination cursor for fetching next/previous page.
    - Returns: A list of issue objects and pagination information (JSON string).

4.  **`get_event_details`**
    - Gets details for a specific event within a project. 📄
    - Inputs:
        - `organization_slug` (string, required): The slug of the organization the project belongs to.
        - `project_slug` (string, required): The slug of the project the event belongs to.
        - `event_id` (string, required): The ID of the event to retrieve.
    - Returns: Detailed information about the specific event (JSON string).

## Environment Variable Configuration

Before running the server, you need to set the following environment variable:

```
SENTRY_AUTH_TOKEN=YOUR_SENTRY_AUTH_TOKEN
```

Optionally, you can also set:

```
SENTRY_BASE_URL=YOUR_SENTRY_BASE_URL # Default: https://sentry.io
```

## Development

Install dependencies:
```bash
npm install
```

Build the server:
```bash
npm run build
```

For development with auto-rebuild:
```bash
npm run watch
```

## Debugging

Since MCP servers communicate over stdio, debugging can be challenging. We recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector), which is available as a package script:

```bash
npm run inspector
```

The Inspector will provide a URL to access debugging tools in your browser.

## License

MIT License
