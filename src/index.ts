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
				limit: z.number().optional(),
			},
			async ({ query, limit = 20 }: { query: string; limit?: number }) => {
				try {
					const raw = await this.callStrapiAPI("search_articles", { query, limit });
					// Strapi response: { query, articles, total, mcpInfo }
					const articles = raw?.articles || [];
					const results = Array.isArray(articles) ? this.transformSearchResults(articles) : [];
					return {
						content: results.map(item => ({
							type: "text",
							text: JSON.stringify(item, null, 2),
						})),
					};
				} catch (error) {
					return {
						content: [{
							type: "text",
							text: `Error searching articles: ${error instanceof Error ? error.message : String(error)}`,
						}],
					};
				}
			}
		);

		// ChatGPT Deep Research - Fetch (latest) tool
		this.server.tool(
			"fetch",
			{
				limit: z.number().optional(),
				category: z.string().optional(),
			},
			async ({ limit = 10, category }: { limit?: number; category?: string }) => {
				try {
					const raw = await this.callStrapiAPI("get_all_articles", { limit, category });
					// Strapi response: { articles, total, metadata, mcpInfo }
					const articles = raw?.articles || [];
					const arr = Array.isArray(articles) ? articles : [articles];
					const items = arr.map(article => this.transformFetchResult(article));
					return {
						content: items.map(item => ({
							type: "text",
							text: JSON.stringify(item, null, 2),
						})),
					};
				} catch (error) {
					return {
						content: [{
							type: "text",
							text: `Error fetching articles: ${error instanceof Error ? error.message : String(error)}`,
						}],
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
			title: article.title || "Untitled Article",
			// Search için summary/excerpt kullan
			text: this.createSnippet(
				article.summary ||
				article.excerpt ||
				article.description ||
				article.fullContent ||
				"No content available"
			),
			url: article.url?.startsWith('http')
				? article.url
				: `https://timely-benefit-e63d540317.strapiapp.com${article.url || `/blog/${article.articleId || article.id}`}`,
		}));
	}

	// Transform fetch result to ChatGPT deep research format
	private transformFetchResult(articleResponse: any): any {
		const article = articleResponse;
		return {
			id: article.id?.toString() || "unknown",
			title: article.title || "Untitled Article",
			// Fetch için full content kullan
			text: article.fullContent || article.description || article.summary || "No content available",
			url: article.url?.startsWith('http')
				? article.url
				: `https://timely-benefit-e63d540317.strapiapp.com${article.url || `/blog/${article.articleId || article.id}`}`,
			metadata: {
				author: article.author,
				publishedAt: article.publishedAt,
				updatedAt: article.updatedAt,
				category: article.category,
				tags: article.tags,
				source: "Keepnet Labs Blog",
				readingTime: article.readingTime,
				wordCount: article.wordCount,
				seo: article.seo,
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
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ name: toolName, arguments: args }),
		});
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}
		const data: any = await response.json();
		if (data.error) {
			throw new Error(data.error.message);
		}
		// Parse the content if it's a string
		if (data.content && data.content[0]?.text) {
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
