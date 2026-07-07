import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { stat } from "node:fs";
import { z } from "zod";

interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

interface Todo {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: "pending" | "in_progress" | "completed";
  priority: "low" | "medium" | "high";
  createdAt: string;
  updatedAt: string;
}

export class MyMCP extends McpAgent {
  server = new McpServer({
    name: "Project Planner MCP",
    version: "1.0.0",
  });

  private get kv(): KVNamespace {
    return (this.env as Env).PROJECT_PALNNER_STORE;
  }

  private async getProjectList(): Promise<string[]> {
    const listData = await this.kv.get("project:list");
    return listData ? JSON.parse(listData) : [];
  }

  private async getTodoList(projectId: string): Promise<string[]> {
    const listData = await this.kv.get(`project:${projectId}:todos`);
    return listData ? JSON.parse(listData) : [];
  }

  private async getTodoByProject(projectId: string): Promise<Todo[]> {
    const todoList = await this.getTodoList(projectId);
    const todos: Todo[] = [];

    for (const todoId of todoList) {
      const todoData = await this.kv.get(`todo:${todoId}`);
      if (todoData) {
        todos.push(JSON.parse(todoData));
      }
    }
    return todos;
  }

  async init() {
    this.server.registerTool(
      "create_project",
      {
        description: "Create a new project",
        inputSchema: {
          name: z.string().describe("Project name"),
          description: z.string().optional().describe("Project description"),
        },
      },
      async ({ name, description }) => {
        const projectId = crypto.randomUUID();

        const project: Project = {
          id: projectId,
          name,
          description: description || "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await this.kv.put(`project:${projectId}`, JSON.stringify(project));

        const projectList = await this.getProjectList();
        projectList.push(projectId);
        await this.kv.put("project:list", JSON.stringify(projectList));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(project, null, 2),
            },
          ],
        };
      },
    );

    this.server.registerTool(
      "list_projects",
      {
        description: "List all projects",
        inputSchema: {},
      },
      async () => {
        const projectList = await this.getProjectList();
        const projects: Project[] = [];

        for (const projectId of projectList) {
          const projectData = await this.kv.get(`project:${projectId}`);
          if (projectData) {
            projects.push(JSON.parse(projectData));
          }
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(projects, null, 2),
            },
          ],
        };
      },
    );

    this.server.registerTool(
      "get_project",
      {
        description: "Get a specific project by ID",
        inputSchema: { projectId: z.string().describe("Project ID") },
      },
      async ({ projectId }) => {
        const projectData = await this.kv.get(`project:${projectId}`);
        if (!projectData) {
          throw new Error(`Project with ID ${projectId} does not exist.`);
        }

        const project: Project = JSON.parse(projectData);
        const todos = await this.getTodoByProject(projectId);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ project, todos }, null, 2),
            },
          ],
        };
      },
    );

    this.server.registerTool(
      "delete_project",
      {
        description: "Delete a project and all it's todos",
        inputSchema: { projectId: z.string().describe("Project ID") },
      },
      async ({ projectId }) => {
        const projectData = await this.kv.get(`project:${projectId}`);
        if (!projectData) {
          throw new Error(`Project with ID ${projectId} does not exist.`);
        }

        const todos = await this.getTodoByProject(projectId);

        for (const todo of todos) {
          await this.kv.delete(`todo:${todo.id}`);
        }

        await this.kv.delete(`project:${projectId}`);
        await this.kv.delete(`project:${projectId}:todos`);

        const projectList = await this.getProjectList();
        const updatedProjectList = projectList.filter((id) => id !== projectId);
        await this.kv.put("project:list", JSON.stringify(updatedProjectList));

        return {
          content: [
            {
              type: "text",
              text: `Project with ID ${projectId} and its todos have been deleted.`,
            },
          ],
        };
      },
    );

    this.server.registerTool(
      "create_todo",
      {
        description: "Create a new todo in a project",
        inputSchema: {
          projectId: z.string().describe("Project ID"),
          title: z.string().describe("Todo title"),
          description: z.string().optional().describe("Todo description"),
          priority: z.enum(["low", "medium", "high"]).describe("Todo priority"),
        },
      },
      async ({ projectId, title, description, priority }) => {
        const projectData = await this.kv.get(`project:${projectId}`);
        if (!projectData) {
          throw new Error(`Project with ID ${projectId} does not exist.`);
        }

        const todoId = crypto.randomUUID();

        const todo: Todo = {
          id: todoId,
          projectId,
          title,
          description: description || "",
          priority: priority || "medium",
          status: "pending",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await this.kv.put(`todo:${todoId}`, JSON.stringify(todo));

        const todoList = await this.getTodoList(projectId);
        todoList.push(todoId);
        await this.kv.put(
          `project:${projectId}:todos`,
          JSON.stringify(todoList),
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(todo, null, 2),
            },
          ],
        };
      },
    );

    this.server.registerTool(
      "update_todo",
      {
        description: "Update a todo's properties",
        inputSchema: {
          todo_id: z.string().describe("Todo title"),
          title: z.string().optional().describe("New todo title"),
          description: z.string().optional().describe("New todo description"),
          status: z
            .enum(["pending", "in_progress", "completed"])
            .describe("New todo status"),
          priority: z
            .enum(["low", "medium", "high"])
            .describe("New todo priority"),
        },
      },
      async ({ todo_id, title, description, status, priority }) => {
        const todoData = await this.kv.get(`todo:${todo_id}`);
        if (!todoData) {
          throw new Error(`Todo with ID ${todo_id} does not exist.`);
        }

        const todo: Todo = JSON.parse(todoData);

        if (title !== undefined) todo.title = title;
        if (description !== undefined) todo.description = description;
        if (status !== undefined) todo.status = status;
        if (priority !== undefined) todo.priority = priority;

        todo.updatedAt = new Date().toISOString();

        await this.kv.put(`todo:${todo_id}`, JSON.stringify(todo));

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(todo, null, 2),
            },
          ],
        };
      },
    );

    this.server.registerTool(
      "delete_todo",
      {
        description: "Delete a todo from a project",
        inputSchema: {
          todo_id: z.string().describe("Todo ID"),
        },
      },
      async ({ todo_id }) => {
        const todoData = await this.kv.get(`todo:${todo_id}`);
        if (!todoData) {
          throw new Error(`Todo with ID ${todo_id} does not exist.`);
        }

        const todo: Todo = JSON.parse(todoData);

        const todoList = await this.getTodoList(todo.projectId);
        const updatedTodoList = todoList.filter((id) => id !== todo_id);
        await this.kv.put(
          `project:${todo.projectId}:todos`,
          JSON.stringify(updatedTodoList),
        );

        await this.kv.delete(`todo:${todo_id}`);

        return {
          content: [
            {
              type: "text",
              text: `Todo with ID ${todo_id} has been deleted from project ${todo.projectId}.`,
            },
          ],
        };
      },
    );

    this.server.registerTool(
      "get_todo",
      {
        description: "Get specific todo by ID",
        inputSchema: {
          todo_id: z.string().describe("Todo ID"),
        },
      },
      async ({ todo_id }) => {
        const todoData = await this.kv.get(`todo:${todo_id}`);
        if (!todoData) {
          throw new Error(`Todo with ID ${todo_id} does not exist.`);
        }

        const todo: Todo = JSON.parse(todoData);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(todo, null, 2),
            },
          ],
        };
      },
    );

    this.server.registerTool(
      "list_todos",
      {
        description: "List all todos in a project",
        inputSchema: {
          project_id: z.string().describe("Project ID"),
          status: z
            .enum(["pending", "in_progress", "completed", "all"])
            .optional()
            .describe("Filter todos by status"),
        },
      },
      async ({ project_id, status }) => {
        const projectData = await this.kv.get(`project:${project_id}`);
        if (!projectData) {
          throw new Error(`Project with ID ${project_id} does not exist.`);
        }

        let todos = await this.getTodoByProject(project_id);

        if (status && status !== "all") {
          todos = todos.filter((todo) => todo.status === status);
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(todos, null, 2),
            },
          ],
        };
      },
    );
  }
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/mcp") {
      return MyMCP.serve("/mcp").fetch(request, env, ctx);
    }

    return new Response("Not found", { status: 404 });
  },
};
