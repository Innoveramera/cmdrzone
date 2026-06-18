// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Fredrik Hammarström

// CmdrZone MCP server launcher (stdio). Point your MCP client's command at:
//   node <repo>/bin/cmdrzone-mcp.mjs   (env: CMDRZONE_INSTANCE=daily|dev or CMDRZONE_DB=<path>)
import { runTool } from './run-tool.mjs'
runTool('mcp.cjs')
