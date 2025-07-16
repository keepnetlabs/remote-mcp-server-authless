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
		// ChatGPT Deep Research - Search tool
		this.server.tool(
			"search",
			{
				query: z.string().describe("Search query string"),
			},
			async ({ query }: { query: string }) => {
				try {
					const limit = 20;

					let raw;
					// If query is "*", get latest articles instead of searching
					if (query.trim() === "*") {
						raw = await this.callStrapiAPI("get_all_articles", { limit });
					} else {
						raw = await this.callStrapiAPI("search_articles", { query, limit });
					}

					const articles = raw?.articles || [];

					if (articles.length === 0) {
						return {
							content: [{
								type: "text",
								text: JSON.stringify([], null, 2),
							}],
						};
					}

					const results = Array.isArray(articles) ? this.transformSearchResults(articles) : [];

					// Return array directly for ChatGPT
					return {
						content: [{
							type: "text",
							text: JSON.stringify(results, null, 2),
						}],
					};
				} catch (error) {
					// Return empty array on error for ChatGPT
					return {
						content: [{
							type: "text",
							text: JSON.stringify([], null, 2),
						}],
					};
				}
			}
		);

		// ChatGPT Deep Research - Fetch tool
		this.server.tool(
			"fetch",
			{
				id: z.string().describe("Unique identifier for the document"),
			},
			async ({ id }: { id: string }) => {
				try {
					const raw = await this.callStrapiAPI("get_article_by_id", { id: parseInt(id) });

					const article = raw?.article;
					if (!article) {
						throw new Error("Document not found");
					}

					const result = this.transformFetchResult(article);

					// Return single object for ChatGPT
					return {
						content: [{
							type: "text",
							text: JSON.stringify(result, null, 2),
						}],
					};
				} catch (error) {
					throw error; // Let ChatGPT handle the error
				}
			}
		);
	}

	// Transform search results to ChatGPT format
	private transformSearchResults(searchResponse: any): any[] {
		if (!searchResponse || !Array.isArray(searchResponse)) {
			return [];
		}

		return searchResponse.map((article: any, index: number) => {
			// Handle both search results and latest articles
			let textContent = "";
			if (article.summary || article.excerpt) {
				// From search_articles API
				textContent = article.summary || article.excerpt || article.description || "No content available";
			} else {
				// From get_all_articles API (latest articles)
				textContent = article.fullContent || article.description || article.summary || "No content available";
			}

			// Return exactly what ChatGPT expects
			const result = {
				id: article.id?.toString() || Math.random().toString(),
				title: article.title || "Untitled Article",
				text: this.createSnippet(textContent),
				url: this.buildArticleUrl(article)
			};

			return result;
		});
	}

	// Transform fetch result to ChatGPT format
	private transformFetchResult(articleResponse: any): any {
		const article = articleResponse;

		// Return exactly what ChatGPT expects
		const result = {
			id: article.id?.toString() || "unknown",
			title: article.title || "Untitled Article",
			text: article.content || article.fullContent || article.description || article.summary || "No content available",
			url: this.buildArticleUrl(article),
			metadata: {
				author: article.author,
				publishedAt: article.publishedAt,
				category: article.category,
				source: "Keepnet Labs Blog"
			}
		};

		return result;
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

	// Helper method to build article URL
	private buildArticleUrl(article: any): string {
		const baseUrl = this.env?.STRAPI_URL || "https://timely-benefit-e63d540317.strapiapp.com";

		// API'den gelen URL'i kullan, yoksa ID ile oluştur
		if (article.url) {
			// Relative URL'se absolute yap
			return article.url.startsWith('http') ? article.url : `${baseUrl}${article.url}`;
		}

		// Fallback: ID ile URL oluştur
		return `${baseUrl}/blog/${article.articleId || article.id}`;
	}

	// Set environment variables
	setEnv(env: Env) {
		this.env = env;
	}

	// Helper method to call Strapi API
	private async callStrapiAPI(toolName: string, args: any) {
		const strapiUrl = this.env?.STRAPI_URL || "https://timely-benefit-e63d540317.strapiapp.com";
		const apiUrl = `${strapiUrl}/api/articles-mcp/mcp/tools/call`;

		try {
			const response = await fetch(apiUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ name: toolName, arguments: args }),
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
			}

			const data: any = await response.json();

			// API error check
			if (data.error) {
				throw new Error(data.error.message || 'API returned error');
			}

			// Strapi API response format: { content: [{ type: "text", text: "JSON string" }] }
			if (data.content && Array.isArray(data.content) && data.content[0]?.text) {
				try {
					const parsed = JSON.parse(data.content[0].text);
					return parsed;
				} catch (parseError) {
					return { articles: [], error: "Failed to parse JSON response" };
				}
			}

			// Fallback - eğer beklenmedik format gelirse
			return data;

		} catch (fetchError) {
			throw fetchError;
		}
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