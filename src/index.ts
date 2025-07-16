import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Define the server
class ArticlesMCPServer {
	private server: Server;
	private env?: Env;

	constructor() {
		this.server = new Server(
			{
				name: "Articles MCP Server",
				version: "1.0.0",
			},
			{
				capabilities: {
					tools: {},
				},
			}
		);

		this.setupHandlers();
	}

	setEnv(env: Env) {
		this.env = env;
	}

	private setupHandlers() {
		// List available tools - ChatGPT deep research compatible
		this.server.setRequestHandler(ListToolsRequestSchema, async () => {
			return {
				tools: [
					{
						name: "search",
						description: "Search for articles and return relevant results with snippets",
						inputSchema: {
							type: "object",
							properties: {
								query: {
									type: "string",
									description: "Search query to find relevant articles",
								},
							},
							required: ["query"],
						},
					},
					{
						name: "fetch",
						description: "Retrieve the full contents of a specific article by ID",
						inputSchema: {
							type: "object",
							properties: {
								id: {
									type: "string",
									description: "Unique identifier for the article to fetch",
								},
							},
							required: ["id"],
						},
					},
				],
			};
		});

		// Handle tool calls
		this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
			const { name, arguments: args } = request.params;

			try {
				switch (name) {
					case "search": {
						const searchResponse = await this.callStrapiAPI("search_articles", {
							query: args.query,
							limit: 20,
						});

						// Transform to ChatGPT deep research format
						const searchResults = this.transformSearchResults(searchResponse);

						return {
							content: [
								{
									type: "text",
									text: JSON.stringify(searchResults, null, 2),
								},
							],
						};
					}

					case "fetch": {
						const articleResponse = await this.callStrapiAPI("get_article_by_id", {
							id: parseInt(args.id),
						});

						// Transform to ChatGPT deep research format
						const fetchResult = this.transformFetchResult(articleResponse);

						return {
							content: [
								{
									type: "text",
									text: JSON.stringify(fetchResult, null, 2),
								},
							],
						};
					}

					default:
						throw new Error(`Unknown tool: ${name}`);
				}
			} catch (error) {
				return {
					content: [
						{
							type: "text",
							text: `Error: ${error instanceof Error ? error.message : String(error)}`,
						},
					],
					isError: true,
				};
			}
		});
	}

	// Transform search results to ChatGPT deep research format
	private transformSearchResults(searchResponse: any): any[] {
		if (!searchResponse || !Array.isArray(searchResponse)) {
			return [];
		}

		return searchResponse.map((article: any) => ({
			id: article.id?.toString() || Math.random().toString(),
			title: article.title || article.name || "Untitled Article",
			text: this.createSnippet(article.content || article.description || article.excerpt || "No content available"),
			url: article.url || article.link || `https://example.com/article/${article.id}`,
		}));
	}

	// Transform fetch result to ChatGPT deep research format
	private transformFetchResult(articleResponse: any): any {
		const article = articleResponse;

		return {
			id: article.id?.toString() || "unknown",
			title: article.title || article.name || "Untitled Article",
			text: article.content || article.description || article.body || "No content available",
			url: article.url || article.link || `https://example.com/article/${article.id}`,
			metadata: {
				author: article.author,
				publishedAt: article.publishedAt || article.created_at,
				category: article.category,
				tags: article.tags,
				updatedAt: article.updatedAt || article.updated_at,
				...article.metadata,
			},
		};
	}

	// Create a snippet from full text (for search results)
	private createSnippet(text: string, maxLength: number = 200): string {
		if (!text || text.length <= maxLength) {
			return text;
		}

		// Try to find a good breaking point
		const snippet = text.substring(0, maxLength);
		const lastSpace = snippet.lastIndexOf(" ");

		if (lastSpace > maxLength * 0.8) {
			return snippet.substring(0, lastSpace) + "...";
		}

		return snippet + "...";
	}

	// Helper method to call Strapi API
	private async callStrapiAPI(toolName: string, args: any) {
		const strapiUrl = this.env?.STRAPI_URL || "https://timely-benefit-e63d540317.strapiapp.com";
		const apiUrl = `${strapiUrl}/api/articles-mcp/mcp/tools/call`;

		const response = await fetch(apiUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				name: toolName,
				arguments: args,
			}),
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const data: any = await response.json();

		if (data.error) {
			throw new Error(data.error.message);
		}

		// Parse the content if it's a string
		if (data.content && data.content[0] && data.content[0].text) {
			try {
				return JSON.parse(data.content[0].text);
			} catch {
				return data.content[0].text;
			}
		}

		return data;
	}

	// Create SSE transport for remote connections
	createSSETransport(path: string) {
		return new SSEServerTransport(path, this.server);
	}

	// Create stdio transport for local connections
	createStdioTransport() {
		return new StdioServerTransport();
	}

	async connect(transport: StdioServerTransport | SSEServerTransport) {
		await this.server.connect(transport);
	}

	getServer() {
		return this.server;
	}
}

// Global server instance
const mcpServer = new ArticlesMCPServer();

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		// Set environment
		mcpServer.setEnv(env);

		// Handle SSE connections
		if (url.pathname === "/sse") {
			const transport = mcpServer.createSSETransport("/sse");
			await mcpServer.connect(transport);
			return transport.handleRequest(request);
		}

		// Default response
		return new Response("MCP Articles Server - Deep Research Compatible\nUse /sse for SSE transport.", {
			status: 200,
			headers: {
				"Content-Type": "text/plain",
			},
		});
	},
};
