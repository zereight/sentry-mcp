#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance } from 'axios';

// Check for Sentry API token environment variable
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;
if (!SENTRY_AUTH_TOKEN) {
  console.error('Error: SENTRY_AUTH_TOKEN environment variable is required.');
  process.exit(1);
}

// Check for Sentry organization slug and project names environment variables
const SENTRY_ORG_SLUG = process.env.SENTRY_ORG_SLUG;
const SENTRY_PROJECT_NAMES = process.env.SENTRY_PROJECT_NAMES; // Changed to accept multiple project names

if (!SENTRY_ORG_SLUG || !SENTRY_PROJECT_NAMES) { // Name changed and check condition modified
  console.error('Error: SENTRY_ORG_SLUG and SENTRY_PROJECT_NAMES environment variables must be set.'); // Name changed
  process.exit(1); // Exit on error
}


// Sentry API base URL (can be set via environment variable if needed)
const SENTRY_BASE_URL = process.env.SENTRY_BASE_URL || 'https://sentry.io';

/**
 * Validate and parse Sentry issue URL or ID
 * @param input - Sentry issue URL or ID string
 * @returns Parsed issue info or null (if invalid)
 */
function parseSentryIssueInput(input: string): { issueId: string } | null {
  try {
    // Check if it's a URL format
    if (input.startsWith('http://') || input.startsWith('https://')) {
      const url = new URL(input);
      const pathParts = url.pathname.split('/');
      // e.g., /issues/6380454530/
      const issuesIndex = pathParts.indexOf('issues');
      if (issuesIndex !== -1 && pathParts.length > issuesIndex + 1) {
        const issueId = pathParts[issuesIndex + 1];
        if (/^\d+$/.test(issueId)) { // Check if it consists only of digits
          return { issueId };
        }
      }
    } else if (/^\d+$/.test(input)) { // Check if it's a simple ID format
      return { issueId: input };
    }
  } catch (e) {
    // Ignore URL parsing errors, etc.
    console.error("Error parsing Sentry input:", e);
  }
  return null;
}

/**
 * Sentry MCP Server class
 */
class SentryServer {
  private server: Server;
  private axiosInstance: AxiosInstance;
  private defaultOrgSlug: string;
  private projectSlugs: string[]; // Store list of project slugs
  private availableProjects: string[] = []; // List of available projects (initialized as an empty array)

  constructor() {
    this.server = new Server(
      {
        name: "sentry-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {}, // Resources or prompts are not used
        },
      }
    );

    // Create axios instance for Sentry API communication
    this.axiosInstance = axios.create({
      baseURL: `${SENTRY_BASE_URL}/api/0/`, // Use Sentry API v0
      headers: {
        Authorization: `Bearer ${SENTRY_AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    // Store value read from environment variable (use ! as existence is guaranteed)
    this.defaultOrgSlug = SENTRY_ORG_SLUG!;
    // Convert comma-separated project names into an array
    this.projectSlugs = SENTRY_PROJECT_NAMES!.split(',').map(s => s.trim()).filter(s => s.length > 0);

    this.setupToolHandlers();

    // Error handling and termination handler
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  /**
   * Setup MCP tool handlers
   */
  private setupToolHandlers() {
    // Return list of available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'get_sentry_issue',
          description: 'Get details for a specific Sentry issue using its ID or URL',
          inputSchema: {
            type: 'object',
            properties: {
              issue_id_or_url: {
                type: 'string',
                description: 'The Sentry issue ID or the full URL of the issue page',
              },
            },
            required: ['issue_id_or_url'],
          },
        },
        {
          name: 'list_organization_projects',
          description: 'List all projects for the configured Sentry organization',
          inputSchema: { // No input parameters
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'list_project_issues',
          description: 'List issues for a specific project, with optional filtering.',
          inputSchema: {
            type: 'object',
            properties: {
              organization_slug: {
                type: 'string',
                description: 'The slug of the organization the project belongs to.',
              },
              project_slug: {
                type: 'string',
                description: 'The slug of the project to list issues for.',
              },
              query: {
                type: 'string',
                description: 'Sentry search query to filter issues (e.g., "is:unresolved", "assignee:me"). Optional.',
              },
              statsPeriod: {
                type: 'string',
                description: 'Time period for statistics (e.g., "24h", "14d", "auto"). Optional.',
              },
              cursor: {
                 type: 'string',
                 description: 'Pagination cursor for fetching next/previous page. Optional.',
              }
            },
            required: ['project_slug'], // Changed project_slug to required
          },
        },
        {
          name: 'get_event_details',
          description: 'Get details for a specific event within a project.',
          inputSchema: {
            type: 'object',
            properties: {
              organization_slug: {
                type: 'string',
                description: 'The slug of the organization the project belongs to.',
              },
              project_slug: {
                type: 'string',
                description: 'The slug of the project the event belongs to.',
              },
              event_id: {
                type: 'string',
                description: 'The ID of the event to retrieve.',
              },
            },
            required: ['event_id', 'project_slug'], // Changed project_slug to required
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      // Branch based on tool name
      switch (request.params.name) {
        case 'get_sentry_issue': {
          // Existing get_sentry_issue logic ... (continued below)
          break; // End case
        }
        case 'list_organization_projects': {
          try {
            // Call Sentry API to get project list
            const response = await this.axiosInstance.get('projects/');
            // On success, return project list data as JSON string
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response.data, null, 2),
                },
              ],
            };
          } catch (error) {
            let errorMessage = 'Failed to list Sentry projects.';
             if (axios.isAxiosError(error)) {
               errorMessage = `Sentry API error: ${error.response?.status} ${error.response?.statusText}. ${JSON.stringify(error.response?.data)}`;
               console.error("Sentry API Error Details:", error.response?.data);
             } else if (error instanceof Error) {
                 errorMessage = error.message;
             }
             console.error("Error listing Sentry projects:", error);
            // On failure, return error message
            return {
              content: [ { type: 'text', text: errorMessage } ],
              isError: true,
            };
          }
          break; // End case
        }
        case 'list_project_issues': {
          let { organization_slug, project_slug, query, statsPeriod, cursor } = request.params.arguments ?? {};

          // If user doesn't provide slug, use default value read from environment variable
          organization_slug = typeof organization_slug === 'string' ? organization_slug : this.defaultOrgSlug;
          // Removed project_slug default assignment

          // project_slug required check
          if (typeof project_slug !== 'string' || project_slug.length === 0) {
            throw new McpError(ErrorCode.InvalidParams, 'Missing or invalid argument: project_slug must be a non-empty string.');
          }

          // Configure parameters for API request
          const apiParams: Record<string, string> = {};
          if (typeof query === 'string' && query.length > 0) apiParams.query = query;
          if (typeof statsPeriod === 'string' && statsPeriod.length > 0) apiParams.statsPeriod = statsPeriod;
          if (typeof cursor === 'string' && cursor.length > 0) apiParams.cursor = cursor;

          try {
            const response = await this.axiosInstance.get(
              `projects/${organization_slug}/${project_slug}/issues/`,
              { params: apiParams }
            );

            // Return result including pagination info (Link header parsing needed)
            const linkHeader = response.headers['link']; // Axios might return header keys in lowercase
            const paginationInfo = parseLinkHeader(linkHeader); // Link header parsing function needed

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    issues: response.data,
                    pagination: paginationInfo, // Add parsed pagination info
                  }, null, 2),
                },
              ],
            };
          } catch (error) {
             let errorMessage = 'Failed to list Sentry project issues.';
             if (axios.isAxiosError(error)) {
               errorMessage = `Sentry API error: ${error.response?.status} ${error.response?.statusText}. ${JSON.stringify(error.response?.data)}`;
               console.error("Sentry API Error Details:", error.response?.data);
             } else if (error instanceof Error) {
                 errorMessage = error.message;
             }
             console.error("Error listing Sentry project issues:", error);
            return {
              content: [ { type: 'text', text: errorMessage } ],
              isError: true,
            };
          }
          break; // End case
        }
        case 'get_event_details': {
          let { organization_slug, project_slug, event_id } = request.params.arguments ?? {};

           // If user doesn't provide slug, use default value read from environment variable
           organization_slug = typeof organization_slug === 'string' ? organization_slug : this.defaultOrgSlug;
           // Removed project_slug default assignment

          // Added project_slug required check
          if (typeof project_slug !== 'string' || project_slug.length === 0) {
             throw new McpError(ErrorCode.InvalidParams, 'Missing or invalid argument: project_slug must be a non-empty string.');
          }
          // event_id required and format check
          if (typeof event_id !== 'string') { // First check if it's string type
            throw new McpError(ErrorCode.InvalidParams, 'Missing or invalid argument: event_id must be a string.');
          }
          // Event ID validation (32-char hex) - event_id is now guaranteed to be string type
          const eventIdRegex = /^[a-f0-9]{32}$/i;
          if (!eventIdRegex.test(event_id)) {
            throw new McpError(ErrorCode.InvalidParams, `Invalid event_id format: '${event_id}'. Please provide a valid 32-character hexadecimal Sentry Event ID. You can get this by clicking 'Copy Event ID' in Sentry.`);
          }

          try {
            const response = await this.axiosInstance.get(
              `projects/${organization_slug}/${project_slug}/events/${event_id}/`
            );
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(response.data, null, 2),
                },
              ],
            };
          } catch (error) {
             let errorMessage = 'Failed to fetch Sentry event details.';
             if (axios.isAxiosError(error)) {
               errorMessage = `Sentry API error: ${error.response?.status} ${error.response?.statusText}. ${JSON.stringify(error.response?.data)}`;
               console.error("Sentry API Error Details:", error.response?.data);
             } else if (error instanceof Error) {
                 errorMessage = error.message;
             }
             console.error("Error fetching Sentry event details:", error);
            return {
              content: [ { type: 'text', text: errorMessage } ],
              isError: true,
            };
          }
          break; // End case
        }
        default: {
          // Handle unknown tool error
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
        }
      } // End switch

      // --- Start of get_sentry_issue logic ---

      const issueInput = request.params.arguments?.issue_id_or_url;

      if (typeof issueInput !== 'string') {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Invalid arguments: issue_id_or_url must be a string.'
        );
      }

      const parsedInput = parseSentryIssueInput(issueInput);

      if (!parsedInput) {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Invalid Sentry issue ID or URL format: ${issueInput}`
        );
      }

      const { issueId } = parsedInput;

      try {
        // Call Sentry API to get issue info
        const response = await this.axiosInstance.get(`issues/${issueId}/`);

        // On success, return issue data as JSON string
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response.data, null, 2), // Pretty-print
            },
          ],
        };
      } catch (error) {
        let errorMessage = 'Failed to fetch Sentry issue.';
        if (axios.isAxiosError(error)) {
          errorMessage = `Sentry API error: ${error.response?.status} ${error.response?.statusText}. ${JSON.stringify(error.response?.data)}`;
          console.error("Sentry API Error Details:", error.response?.data);
        } else if (error instanceof Error) {
            errorMessage = error.message;
        }
         console.error("Error fetching Sentry issue:", error);
        // On failure, return error message
        return {
          content: [
            {
              type: 'text',
              text: errorMessage,
            },
          ],
          isError: true,
        };
      }
    }); // End CallToolRequestSchema handler

    // --- Helper function to parse Link header ---
    function parseLinkHeader(header: string | undefined): Record<string, string> {
        if (!header) return {};

        const links: Record<string, string> = {};
        const parts = header.split(',');

        parts.forEach(part => {
            const section = part.split(';');
            if (section.length < 2) return;

            const urlMatch = section[0].match(/<(.*)>/);
            if (!urlMatch) return;
            const url = urlMatch[1];

            const params: Record<string, string> = {};
            section.slice(1).forEach(paramPart => {
                const param = paramPart.trim().split('=');
                if (param.length === 2) {
                    params[param[0]] = param[1].replace(/"/g, '');
                }
            });

            if (params.rel && params.results === 'true' && params.cursor) {
                 links[params.rel] = params.cursor; // Use rel value (next or prev) as key
            }
        });
        return links;
    }
  }

  /**
   * Run the server
   */
  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Sentry MCP server running on stdio');
  }
}

// Create and run server instance
const server = new SentryServer();
server.run().catch((error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});
