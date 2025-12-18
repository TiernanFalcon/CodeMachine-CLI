import * as path from 'node:path';

/**
 * Parsed tool use information
 */
export interface ToolUse {
  tool?: string;
  parameters?: Record<string, any>;
}

/**
 * Extracted context from tool use
 */
export interface ToolContext {
  currentFile?: string;
  currentAction?: string;
}

/**
 * Parse tool use from agent output
 * Handles both XML-style and JSON-style tool calls
 */
export function parseToolUse(output: string): ToolUse {
  // Try to parse XML-style tool use (Anthropic/Claude format)
  // Matches both <invoke> and <invoke> formats
  const xmlMatch = output.match(/<(?:antml:)?invoke name="([^"]+)">([\s\S]*?)<\/(?:antml:)?invoke>/);
  if (xmlMatch) {
    const toolName = xmlMatch[1];
    const paramsContent = xmlMatch[2];

    // Extract parameters - matches both <parameter> and <parameter> formats
    const params: Record<string, any> = {};
    const paramMatches = paramsContent.matchAll(/<(?:antml:)?parameter name="([^"]+)">([^<]*)<\/(?:antml:)?parameter>/g);

    for (const match of paramMatches) {
      params[match[1]] = match[2];
    }

    return {
      tool: toolName,
      parameters: params
    };
  }

  // Try to parse JSON-style tool calls (OpenAI format)
  const jsonMatch = output.match(/"function":\s*{\s*"name":\s*"([^"]+)".*?"arguments":\s*({[^}]+})/s);
  if (jsonMatch) {
    try {
      return {
        tool: jsonMatch[1],
        parameters: JSON.parse(jsonMatch[2])
      };
    } catch {
      // Parsing failed, return partial info
      return { tool: jsonMatch[1] };
    }
  }

  return {};
}

/**
 * Extract context information from tool use
 */
export function extractContextFromTool(tool: string, params: Record<string, any>): ToolContext {
  const context: ToolContext = {};

  switch (tool) {
    case 'Read':
      if (params.file_path) {
        context.currentFile = params.file_path;
        context.currentAction = `Reading ${path.basename(params.file_path)}`;
      }
      break;

    case 'Write':
      if (params.file_path) {
        context.currentFile = params.file_path;
        context.currentAction = `Writing ${path.basename(params.file_path)}`;
      }
      break;

    case 'Edit':
      if (params.file_path) {
        context.currentFile = params.file_path;
        context.currentAction = `Editing ${path.basename(params.file_path)}`;
      }
      break;

    case 'Bash':
      if (params.description) {
        context.currentAction = params.description;
      } else if (params.command) {
        // Fallback to truncated command if no description
        const cmd = params.command.substring(0, 50);
        context.currentAction = cmd.length < params.command.length ? `${cmd}...` : cmd;
      }
      break;

    case 'Glob':
      if (params.pattern) {
        context.currentAction = `Searching: ${params.pattern}`;
      }
      break;

    case 'Grep':
      if (params.pattern) {
        context.currentAction = `Searching: ${params.pattern}`;
      }
      break;

    case 'Task':
      if (params.description) {
        context.currentAction = params.description;
      }
      break;

    case 'AskUserQuestion':
      context.currentAction = 'Asking user question';
      break;

    case 'WebFetch':
    case 'WebSearch':
      context.currentAction = 'Searching web';
      break;

    default:
      // Generic action for unknown tools
      if (tool) {
        context.currentAction = `Using ${tool} tool`;
      }
  }

  return context;
}

/**
 * Extract goal from initial prompt or agent message
 */
export function extractGoal(promptOrMessage: string): string | undefined {
  // Look for common goal/task patterns
  const patterns = [
    /(?:goal|objective|task):\s*(.+)/i,
    /(?:please|help me|i want to)\s+(.+?)[\.\n]/i,
    /^(.+?)(?:\.|\n)/  // First sentence as fallback
  ];

  for (const pattern of patterns) {
    const match = promptOrMessage.match(pattern);
    if (match && match[1]) {
      const goal = match[1].trim();
      // Filter out very short or very long goals
      if (goal.length > 10 && goal.length < 100) {
        return goal;
      }
    }
  }

  return undefined;
}
