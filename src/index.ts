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
		// Article Tools - Get all articles
		this.server.tool(
			"get_all_articles",
			{
				limit: z.number().optional().default(1000),
				category: z.string().optional(),
			},
			async ({ limit = 1000, category }: { limit?: number; category?: string }) => {
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

		// Article Tools - Search articles
		this.server.tool(
			"search_articles",
			{
				query: z.string(),
				limit: z.number().optional().default(20),
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

		// Article Tools - Get article by ID
		this.server.tool(
			"get_article_by_id",
			{
				id: z.number(),
			},
			async ({ id }: { id: number }) => {
				try {
					const response = await this.callStrapiAPI("get_article_by_id", { id });
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
							text: `Error fetching article: ${error instanceof Error ? error.message : String(error)}`
						}]
					};
				}
			}
		);

		// Article Tools - Get article categories
		this.server.tool(
			"get_article_categories",
			{},
			async () => {
				try {
					const response = await this.callStrapiAPI("get_article_categories", {});
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
							text: `Error fetching categories: ${error instanceof Error ? error.message : String(error)}`
						}]
					};
				}
			}
		);
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
