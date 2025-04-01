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
      ],
    }));

    // 도구 호출 처리
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== 'get_sentry_issue') {
        throw new McpError(
          ErrorCode.MethodNotFound,
          `Unknown tool: ${request.params.name}`
        );
      }

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
    });
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
