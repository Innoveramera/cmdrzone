// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// CmdrZone MCP server — exposes the board command core as MCP tools over stdio so tool-calling
// agents (Claude Code/Desktop) can file and manage cards themselves. Runs under
// ELECTRON_RUN_AS_NODE (see bin/cmdrzone-mcp.mjs) to reuse the Electron-ABI better-sqlite3, and
// reads the DB path from $CMDRZONE_DB / $CMDRZONE_INSTANCE (set in the MCP client config).
//
// IMPORTANT: stdout is the MCP transport — never console.log here; diagnostics go to stderr.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { initDatabase, closeDatabase } from '@core/persistence/database'
import { requireDbPath } from '@core/persistence/db-path'
import * as cmd from '@core/board/commands'

const CARD_TYPE = z.enum(['idea', 'feature', 'bug', 'task'])

function ok(data: unknown): { content: { type: 'text'; text: string }[] } {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

const server = new McpServer({ name: 'cmdrzone', version: '0.1.0' })

server.registerTool(
  'list_projects',
  {
    title: 'List projects',
    description:
      'List all CmdrZone projects (name, path, type). Use a name or absolute path as the <project> argument in the other tools.',
    inputSchema: {}
  },
  async () => ok(cmd.listProjects())
)

server.registerTool(
  'get_board',
  {
    title: 'Get board',
    description: 'Get the Kanban board (columns + cards) for a project.',
    inputSchema: { project: z.string().describe('Project name or absolute path') }
  },
  async ({ project }) => ok(cmd.getBoardFor(project))
)

server.registerTool(
  'create_card',
  {
    title: 'Create card',
    description:
      'Create a card on a project board. `type` is one of idea | feature | bug | task (default: task). Use create_card to file a new idea/feature/bug/task on the board.',
    inputSchema: {
      project: z.string().describe('Project name or absolute path'),
      column: z.string().describe('Target column name (e.g. "Ideas", "To Do") or column id'),
      title: z.string().describe('Card title'),
      body: z.string().optional().describe('Optional longer description'),
      type: CARD_TYPE.optional().describe('idea | feature | bug | task (default task)')
    }
  },
  async (a) => ok(cmd.addCard(a))
)

server.registerTool(
  'update_card',
  {
    title: 'Update card',
    description: 'Update a card title, body, and/or type by id.',
    inputSchema: {
      id: z.string().describe('Card id'),
      title: z.string().optional(),
      body: z.string().optional(),
      type: CARD_TYPE.optional()
    }
  },
  async ({ id, title, body, type }) => ok(cmd.updateCard(id, { title, body, type }))
)

server.registerTool(
  'move_card',
  {
    title: 'Move card',
    description:
      'Move a card to another column and/or position by id. Omit position to append to the end of the target column.',
    inputSchema: {
      id: z.string().describe('Card id'),
      column: z.string().optional().describe('Target column name or id'),
      position: z.number().optional()
    }
  },
  async ({ id, column, position }) => ok(cmd.moveCard(id, { column, position }))
)

server.registerTool(
  'delete_card',
  {
    title: 'Delete card',
    description: 'Delete a card by id.',
    inputSchema: { id: z.string().describe('Card id') }
  },
  async ({ id }) => ok(cmd.removeCard(id))
)

server.registerTool(
  'create_column',
  {
    title: 'Create column',
    description: 'Add a new column to a project board.',
    inputSchema: { project: z.string(), title: z.string() }
  },
  async ({ project, title }) => ok(cmd.addColumn(project, title))
)

server.registerTool(
  'rename_column',
  {
    title: 'Rename column',
    description: 'Rename a column on a project board.',
    inputSchema: { project: z.string(), column: z.string(), title: z.string() }
  },
  async ({ project, column, title }) => ok(cmd.renameColumn(project, column, title))
)

server.registerTool(
  'delete_column',
  {
    title: 'Delete column',
    description: 'Delete a column and all its cards from a project board.',
    inputSchema: { project: z.string(), column: z.string() }
  },
  async ({ project, column }) => ok(cmd.removeColumn(project, column))
)

async function main(): Promise<void> {
  initDatabase(requireDbPath())
  await server.connect(new StdioServerTransport())
}

main().catch((err) => {
  console.error(`cmdrzone-mcp: ${err instanceof Error ? err.message : String(err)}`)
  closeDatabase()
  process.exit(1)
})
