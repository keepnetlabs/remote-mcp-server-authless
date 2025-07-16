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
				query: z.string().describe("Search query string. Use '*' or empty string to get latest articles"),
			},
			async ({ query }: { query: string }) => {
				try {
					const limit = 20; // Fixed limit for ChatGPT compatibility
					console.log(`🔍 SEARCH - Query: "${query}", Limit: ${limit}`);

					let raw;
					// If query is empty or "*", get latest articles
					if (!query || query.trim() === "" || query.trim() === "*") {
						console.log("📥 SEARCH - Getting latest articles (empty query)");
						raw = await this.callStrapiAPI("get_all_articles", { limit });
					} else {
						console.log("📥 SEARCH - Performing search with query");
						raw = await this.callStrapiAPI("search_articles", { query, limit });
					}


					// Handle both search results and latest articles
					const articles = raw?.articles || [];
					console.log(`📊 SEARCH - Found ${articles.length} articles`);

					if (articles.length === 0) {
						console.log("⚠️ SEARCH - No articles found");
						return {
							content: [{
								type: "text",
								text: JSON.stringify({
									message: query && query.trim() !== "" && query.trim() !== "*"
										? "No articles found for your search query"
										: "No articles available",
									query: query,
									suggestions: [
										"Try broader keywords",
										"Check spelling",
										"Use different terms like 'phishing', 'security', 'malware'"
									],
									availableCategories: [
										"Social Engineering",
										"Human Risk Management",
										"Malware",
										"Phishing Simulation",
										"Security Awareness Training"
									]
								}, null, 2),
							}],
						};
					}

					const results = Array.isArray(articles) ? this.transformSearchResults(articles) : [];
					console.log(`✅ SEARCH - Transformed ${results.length} results`);

					return {
						content: results.map(item => ({
							type: "text",
							text: JSON.stringify(item, null, 2),
						})),
					};
				} catch (error) {
					console.error("❌ SEARCH - Error:", error);
					return {
						content: [{
							type: "text",
							text: JSON.stringify({
								error: "Search failed",
								message: error instanceof Error ? error.message : String(error),
								query: query,
								timestamp: new Date().toISOString()
							}, null, 2),
						}],
					};
				}
			}
		);

		// ChatGPT Deep Research - Fetch tool (single document by ID)
		this.server.tool(
			"fetch",
			{
				id: z.string().describe("Unique identifier for the document"),
			},
			async ({ id }: { id: string }) => {
				try {
					console.log(`📄 FETCH - Document ID: "${id}"`);
					const raw = await this.callStrapiAPI("get_article_by_id", { id: parseInt(id) });

					console.log("📥 FETCH - Parsed Response:", JSON.stringify(raw, null, 2));

					// API'den dönen format: { article: {...}, mcpInfo: {...} }
					const article = raw?.article;
					if (!article) {
						console.log("⚠️ FETCH - Article not found");
						return {
							content: [{
								type: "text",
								text: JSON.stringify({
									error: "Document not found",
									id: id,
									message: "The requested document could not be found"
								}, null, 2),
							}],
						};
					}

					const result = this.transformFetchResult(article);
					console.log(`✅ FETCH - Transformed result:`, result.title);

					return {
						content: [{
							type: "text",
							text: JSON.stringify(result, null, 2),
						}],
					};
				} catch (error) {
					console.error("❌ FETCH - Error:", error);
					return {
						content: [{
							type: "text",
							text: JSON.stringify({
								error: "Fetch failed",
								message: error instanceof Error ? error.message : String(error),
								id: id,
								timestamp: new Date().toISOString()
							}, null, 2),
						}],
					};
				}
			}
		);
	}

	// Transform search results to ChatGPT deep research format
	private transformSearchResults(searchResponse: any): any[] {
		console.log("🔄 TRANSFORM SEARCH - Input:", JSON.stringify(searchResponse, null, 2));

		if (!searchResponse || !Array.isArray(searchResponse)) {
			console.log("⚠️ TRANSFORM SEARCH - Invalid input, not an array");
			return [];
		}

		return searchResponse.map((article: any, index: number) => {
			console.log(`📄 TRANSFORM SEARCH - Article ${index + 1}:`, article.title || 'No title');

			// Extract category from tags if missing (search API doesn't return category)
			let category = article.category;
			if (!category && article.tags && Array.isArray(article.tags) && article.tags.length > 0) {
				category = article.tags[0]; // Use first tag as category
			}

			// Handle both search results and latest articles
			// Search results have: summary, excerpt
			// Latest articles have: fullContent, description
			let textContent = "";
			if (article.summary || article.excerpt) {
				// From search_articles API
				textContent = article.summary || article.excerpt || article.description || "No content available";
			} else {
				// From get_all_articles API (latest articles)
				textContent = article.fullContent || article.description || article.summary || "No content available";
			}

			const result = {
				id: article.id?.toString() || Math.random().toString(),
				title: article.title || "Untitled Article",
				// Always create snippet for search tool (not full content)
				text: this.createSnippet(textContent),
				url: this.buildArticleUrl(article),
				metadata: {
					category: category || "Blog",
					author: article.author,
					publishedAt: article.publishedAt,
					tags: article.tags,
					relevanceScore: article.relevanceScore
				}
			};

			console.log(`✅ TRANSFORM SEARCH - Result ${index + 1}:`, result.title);
			return result;
		});
	}

	// Transform fetch result to ChatGPT deep research format
	private transformFetchResult(articleResponse: any): any {
		console.log("🔄 TRANSFORM FETCH - Input:", JSON.stringify(articleResponse, null, 2));

		const article = articleResponse;
		const result = {
			id: article.id?.toString() || "unknown",
			title: article.title || "Untitled Article",
			// get_article_by_id returns 'content', get_all_articles returns 'fullContent'
			text: article.content || article.fullContent || article.description || article.summary || "No content available",
			url: this.buildArticleUrl(article),
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
			},
		};

		console.log(`✅ TRANSFORM FETCH - Result:`, result.title);
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

		console.log("🌐 API CALL - URL:", apiUrl);
		console.log("📤 API CALL - Tool:", toolName);
		console.log("📤 API CALL - Args:", JSON.stringify(args, null, 2));

		try {
			const response = await fetch(apiUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ name: toolName, arguments: args }),
			});

			console.log("📡 API CALL - Response Status:", response.status);

			if (!response.ok) {
				const errorText = await response.text();
				console.error("❌ API CALL - Error Response:", errorText);
				throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
			}

			const data: any = await response.json();
			console.log("📥 API CALL - Raw Response:", JSON.stringify(data, null, 2));

			// API error check
			if (data.error) {
				console.error("❌ API CALL - API Error:", data.error);
				throw new Error(data.error.message || 'API returned error');
			}

			// Strapi API response format: { content: [{ type: "text", text: "JSON string" }] }
			if (data.content && Array.isArray(data.content) && data.content[0]?.text) {
				try {
					const parsed = JSON.parse(data.content[0].text);
					console.log("🔍 API CALL - Parsed JSON:", JSON.stringify(parsed, null, 2));
					return parsed;
				} catch (parseError) {
					console.error("❌ Parse Error:", parseError);
					console.log("📄 API CALL - Returning raw text content");
					return { articles: [], error: "Failed to parse JSON response" };
				}
			}

			// Fallback - eğer beklenmedik format gelirse
			console.log("⚠️ API CALL - Unexpected response format, returning raw data");
			return data;

		} catch (fetchError) {
			console.error("❌ API CALL - Fetch Error:", fetchError);
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