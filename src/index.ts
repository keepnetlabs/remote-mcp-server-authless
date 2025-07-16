import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Define our MCP agent with tools for Articles
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Articles MCP Server",
		version: "1.0.0",
	});

	private env?: Env;

	async init() {
		// ChatGPT Deep Research - Enhanced Search tool
		this.server.tool(
			"search",
			{
				query: z.string(),
			},
			async ({ query, limit = 20 }: { query: string; limit?: number }) => {
				try {
					const response = await this.callStrapiAPI("search_articles", { query, limit });
					return {
						content: [{
							type: "text",
							text: JSON.stringify(response, null, 2)
						}]
					};
				} catch (error) {
					return {
						content: [{
							type: "text",
							text: `Error searching articles: ${error instanceof Error ? error.message : String(error)}`
						}]
					};
				}
			}
		);

		// ChatGPT Deep Research - Fetch tool
		this.server.tool(
			"fetch",
			{
				id: z.string(),
			},
			async ({ limit = 100, category }: { limit?: number; category?: string }) => {
				try {
					const response = await this.callStrapiAPI("get_all_articles", { limit, category });
					return {
						content: [{
							type: "text",
							text: JSON.stringify(response, null, 2)
						}]
					};
				} catch (error) {
					return {
						content: [{
							type: "text",
							text: `Error fetching articles: ${error instanceof Error ? error.message : String(error)}`
						}]
					};
				}
			}
		);
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
			url: article.url || article.link || `https://timely-benefit-e63d540317.strapiapp.com/articles/${article.id}`,
		}));
	}

	// Transform fetch result to ChatGPT deep research format
	private transformFetchResult(articleResponse: any): any {
		const article = articleResponse;

		return {
			id: article.id?.toString() || "unknown",
			title: article.title || article.name || "Untitled Article",
			text: article.content || article.description || article.body || "No content available",
			url: article.url || article.link || `https://timely-benefit-e63d540317.strapiapp.com/articles/${article.id}`,
			metadata: {
				author: article.author,
				publishedAt: article.publishedAt || article.created_at,
				category: article.category,
				tags: article.tags,
				updatedAt: article.updatedAt || article.updated_at,
				source: "Strapi CMS",
				...article.metadata,
			},
		};
	}

	// Create a snippet from full text (for search results)
	private createSnippet(text: string, maxLength: number = 512): string {
		if (!text || text.length <= maxLength) {
			return text;
		}

		const snippet = text.substring(0, maxLength);
		const lastSpace = snippet.lastIndexOf(" ");

		if (lastSpace > maxLength * 0.8) {
			return snippet.substring(0, lastSpace) + "...";
		}

		return snippet + "...";
	}

	// Set environment variables
	setEnv(env: Env) {
		this.env = env;
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
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
		}

		if (url.pathname === "/mcp") {
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};