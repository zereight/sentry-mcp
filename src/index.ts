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

// Sentry API 토큰 환경 변수 확인
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN;
if (!SENTRY_AUTH_TOKEN) {
  throw new Error('SENTRY_AUTH_TOKEN environment variable is required');
}

// Sentry API 기본 URL (필요시 환경 변수 등으로 설정 가능)
const SENTRY_BASE_URL = process.env.SENTRY_BASE_URL || 'https://sentry.io';

/**
 * Sentry 이슈 URL 또는 ID 유효성 검사 및 파싱
 * @param input - Sentry 이슈 URL 또는 ID 문자열
 * @returns 파싱된 이슈 정보 또는 null (유효하지 않은 경우)
 */
function parseSentryIssueInput(input: string): { issueId: string } | null {
  try {
    // URL 형태인지 확인
    if (input.startsWith('http://') || input.startsWith('https://')) {
      const url = new URL(input);
      const pathParts = url.pathname.split('/');
      // 예: /issues/6380454530/
      const issuesIndex = pathParts.indexOf('issues');
      if (issuesIndex !== -1 && pathParts.length > issuesIndex + 1) {
        const issueId = pathParts[issuesIndex + 1];
        if (/^\d+$/.test(issueId)) { // 숫자로만 구성되었는지 확인
          return { issueId };
        }
      }
    } else if (/^\d+$/.test(input)) { // 단순 ID 형태인지 확인
      return { issueId: input };
    }
  } catch (e) {
    // URL 파싱 오류 등은 무시
    console.error("Error parsing Sentry input:", e);
  }
  return null;
}

/**
 * Sentry MCP 서버 클래스
 */
class SentryServer {
  private server: Server;
  private axiosInstance: AxiosInstance;

  constructor() {
    this.server = new Server(
      {
        name: "sentry-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {}, // 리소스나 프롬프트는 사용하지 않음
        },
      }
    );

    // Sentry API 통신을 위한 axios 인스턴스 생성
    this.axiosInstance = axios.create({
      baseURL: `${SENTRY_BASE_URL}/api/0/`, // Sentry API v0 사용
      headers: {
        Authorization: `Bearer ${SENTRY_AUTH_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    this.setupToolHandlers();

    // 오류 처리 및 종료 핸들러
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  /**
   * MCP 도구 핸들러 설정
   */
  private setupToolHandlers() {
    // 사용 가능한 도구 목록 반환
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
          inputSchema: { // 입력 파라미터 없음
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
            required: ['organization_slug', 'project_slug'],
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
            required: ['organization_slug', 'project_slug', 'event_id'],
          },
        },
      ],
    }));

    // 도구 호출 처리
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      // 도구 이름에 따라 분기
      switch (request.params.name) {
        case 'get_sentry_issue': {
          // 기존 get_sentry_issue 로직 ... (아래에서 계속)
          break; // case 종료
        }
        case 'list_organization_projects': {
          try {
            // Sentry API 호출하여 프로젝트 목록 가져오기
            const response = await this.axiosInstance.get('projects/');
            // 성공 시 프로젝트 목록 데이터를 JSON 문자열로 반환
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
            // 실패 시 오류 메시지 반환
            return {
              content: [ { type: 'text', text: errorMessage } ],
              isError: true,
            };
          }
          break; // case 종료
        }
        case 'list_project_issues': {
          const { organization_slug, project_slug, query, statsPeriod, cursor } = request.params.arguments ?? {};

          if (typeof organization_slug !== 'string' || typeof project_slug !== 'string') {
            throw new McpError(ErrorCode.InvalidParams, 'Missing required arguments: organization_slug and project_slug must be strings.');
          }

          // API 요청을 위한 파라미터 구성
          const apiParams: Record<string, string> = {};
          if (typeof query === 'string' && query.length > 0) apiParams.query = query;
          if (typeof statsPeriod === 'string' && statsPeriod.length > 0) apiParams.statsPeriod = statsPeriod;
          if (typeof cursor === 'string' && cursor.length > 0) apiParams.cursor = cursor;

          try {
            const response = await this.axiosInstance.get(
              `projects/${organization_slug}/${project_slug}/issues/`,
              { params: apiParams }
            );

            // 페이지네이션 정보를 포함하여 결과 반환 (Link 헤더 파싱 필요)
            const linkHeader = response.headers['link']; // Axios는 소문자로 헤더 키를 반환할 수 있음
            const paginationInfo = parseLinkHeader(linkHeader); // Link 헤더 파싱 함수 필요

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    issues: response.data,
                    pagination: paginationInfo, // 파싱된 페이지네이션 정보 추가
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
          break; // case 종료
        }
        case 'get_event_details': {
          const { organization_slug, project_slug, event_id } = request.params.arguments ?? {};

          if (typeof organization_slug !== 'string' || typeof project_slug !== 'string' || typeof event_id !== 'string') {
            throw new McpError(ErrorCode.InvalidParams, 'Missing required arguments: organization_slug, project_slug, and event_id must be strings.');
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
          break; // case 종료
        }
        default: {
          // 알 수 없는 도구 오류 처리
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
        }
      } // switch 종료

      // --- get_sentry_issue 로직 시작 ---

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
        // Sentry API 호출하여 이슈 정보 가져오기
        const response = await this.axiosInstance.get(`issues/${issueId}/`);

        // 성공 시 이슈 데이터를 JSON 문자열로 반환
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response.data, null, 2), // 보기 좋게 포맷팅
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
        // 실패 시 오류 메시지 반환
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
    }); // CallToolRequestSchema 핸들러 종료

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
                 links[params.rel] = params.cursor; // rel 값 (next 또는 prev)을 키로 사용
            }
        });
        return links;
    }
  }

  /**
   * 서버 실행
   */
  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Sentry MCP server running on stdio');
  }
}

// 서버 인스턴스 생성 및 실행
const server = new SentryServer();
server.run().catch((error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});
