import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";

// Create server instance
const server = new McpServer({
  name: "sample-mcp",
  version: "1.0.0",
});

server.registerTool(
  "add-numbers",
  {
    description: "Add two numbers together",
    inputSchema: {
      a: z.number().describe("The first number to add"),
      b: z.number().describe("The second number to add"),
    },
  },
  ({ a, b }) => {
    return {
      content: [
        { type: "text", text: `The sum of ${a} and ${b} is ${a + b}.` },
      ],
    };
  },
);

server.registerTool(
  "get-gihub-repos",
  {
    description: "Get Github repositories from the given username",
    inputSchema: {
      username: z.string().describe("Github username"),
    },
  },
  async ({ username }) => {
    const res = await fetch(`https://api.github.com/users/${username}/repos`, {
      headers: {
        "User-Agent": "MCP-Server",
      },
    });

    if (!res.ok)
      throw new Error(`Github API Error ${res.status}: ${res.statusText}`);

    const repos = await res.json();

    const repoList = repos
      .map((repo: any, i: number) => `${i + 1}. ${repo.name}`)
      .join("\n\n");

    return {
      content: [
        {
          type: "text",
          text: `Github repositories for ${username}: (${repos.length} repos): \n\n${repoList}`,
        },
      ],
    };
  },
);

server.registerResource(
  "apartment-rules",
  "rules://all",
  {
    description: "Resource for all apartment rules",
    mimeType: "text/plain",
  },
  async (uri) => {
    const uriString = uri.toString();
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const rules = await fs.readFile(
      path.resolve(__dirname, "../src/data/rules.txt"),
      "utf-8",
    );
    return {
      contents: [
        {
          uri: uriString,
          mimeType: "text/plain",
          text: rules,
        },
      ],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Error starting server:", error);
});
