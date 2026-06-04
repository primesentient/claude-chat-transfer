/**
 * conversation.js — parse Claude's API response, build rich import prompts
 * Captures: text, code, tool_use (bash/computer/web), tool_result, thinking
 */

function parseConversation(raw) {
  if (!raw || !raw.chat_messages) throw new Error('Invalid conversation data');

  const msgMap = {};
  for (const msg of raw.chat_messages) msgMap[msg.uuid] = msg;

  // Walk active branch: leaf → root, then reverse
  const trunk = [];
  let current = raw.current_leaf_message_uuid;
  while (current && current !== CT.ROOT_UUID && msgMap[current]) {
    trunk.push(msgMap[current]);
    current = msgMap[current].parent_message_uuid;
  }
  trunk.reverse();

  const messages = trunk
    .filter((m) => m.sender === 'human' || m.sender === 'assistant')
    .map((msg, index) => ({
      index: index + 1,
      role: msg.sender,
      contentBlocks: parseContentBlocks(msg.content || []),
      hasFiles: !!(msg.files?.length || msg.attachments?.length),
      fileNames: [
        ...(msg.files || []).map(f => f.file_name || f.name || 'file'),
        ...(msg.attachments || []).map(a => a.file_name || a.name || 'attachment'),
      ],
    }));

  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    conversation: {
      id: raw.uuid,
      title: raw.name || 'Untitled Conversation',
      model: raw.model || 'unknown',
      createdAt: raw.created_at,
    },
    messages,
  };
}

function parseContentBlocks(content) {
  const blocks = [];
  for (const block of content) {
    if (!block) continue;
    switch (block.type) {

      case 'text':
        if (block.text?.trim()) blocks.push({ type: 'text', text: block.text });
        break;

      case 'thinking':
        if (block.thinking?.trim()) blocks.push({ type: 'thinking', text: block.thinking });
        break;

      case 'tool_use': {
        // Determine tool category for better labelling
        const name = block.name || 'unknown_tool';
        let category = 'tool';
        if (['bash', 'computer', 'str_replace_editor', 'text_editor'].includes(name)) category = 'command';
        if (name === 'web_search' || name === 'brave_search') category = 'search';
        if (name === 'web_fetch') category = 'fetch';
        if (name.includes('repl') || name.includes('execute') || name.includes('run')) category = 'command';

        blocks.push({
          type: 'tool_use',
          category,
          name,
          input: block.input || {},
          toolUseId: block.id,
        });
        break;
      }

      case 'tool_result': {
        // Flatten content — can be string or array of text/image blocks
        let result = '';
        let hasImage = false;
        if (typeof block.content === 'string') {
          result = block.content;
        } else if (Array.isArray(block.content)) {
          for (const c of block.content) {
            if (c.type === 'text') result += (result ? '\n' : '') + c.text;
            if (c.type === 'image') hasImage = true;
          }
        }
        blocks.push({
          type: 'tool_result',
          toolUseId: block.tool_use_id,
          result: result.trim(),
          isError: block.is_error || false,
          hasImage,
        });
        break;
      }

      case 'code':
        if ((block.code || block.text)?.trim()) {
          blocks.push({
            type: 'code',
            language: block.language || '',
            code: block.code || block.text || '',
          });
        }
        break;

      default:
        // Catch-all: if it has text, keep it
        if (block.text?.trim()) blocks.push({ type: 'text', text: block.text });
    }
  }
  return blocks;
}

// ── Build the import prompt ──────────────────────────────────────

function buildImportPrompt(parsed) {
  const lines = [
    '╔══════════════════════════════════════╗',
    '║      CONVERSATION TRANSFER           ║',
    '╚══════════════════════════════════════╝',
    `Title:     ${parsed.conversation.title}`,
    `Model:     ${parsed.conversation.model}`,
    `Messages:  ${parsed.messages.length}`,
    `Exported:  ${parsed.exportedAt}`,
    '',
    'This is a full conversation export. Please read all messages carefully and continue naturally from the last point, with full context of everything discussed.',
    '',
  ];

  for (const msg of parsed.messages) {
    const bar = msg.role === 'human'
      ? `┌─── HUMAN [${msg.index}] ${'─'.repeat(30)}`
      : `┌─── CLAUDE [${msg.index}] ${'─'.repeat(29)}`;
    lines.push(bar);

    for (const block of msg.contentBlocks) {
      switch (block.type) {

        case 'text':
          lines.push(block.text);
          break;

        case 'thinking':
          lines.push(`<thinking>\n${block.text}\n</thinking>`);
          break;

        case 'code':
          lines.push(`\`\`\`${block.language || ''}`);
          lines.push(block.code);
          lines.push('```');
          break;

        case 'tool_use': {
          const { name, category, input } = block;
          if (category === 'command') {
            // Bash / terminal command — show prominently
            const cmd = input.command || input.cmd || input.code || JSON.stringify(input);
            lines.push(`[${name.toUpperCase()} COMMAND]`);
            lines.push('```bash');
            lines.push(cmd);
            lines.push('```');
          } else if (category === 'search') {
            lines.push(`[WEB SEARCH: "${input.query || input.q || JSON.stringify(input)}"]`);
          } else if (category === 'fetch') {
            lines.push(`[WEB FETCH: ${input.url || JSON.stringify(input)}]`);
          } else {
            // Generic tool call
            lines.push(`[TOOL CALL: ${name}]`);
            if (Object.keys(input).length) {
              lines.push('```json');
              lines.push(JSON.stringify(input, null, 2));
              lines.push('```');
            }
          }
          break;
        }

        case 'tool_result': {
          const label = block.isError ? '[COMMAND OUTPUT — ERROR]' : '[COMMAND OUTPUT]';
          lines.push(label);
          if (block.result) {
            lines.push('```');
            // Truncate very long outputs
            const truncated = block.result.length > 3000
              ? block.result.slice(0, 3000) + '\n... [truncated]'
              : block.result;
            lines.push(truncated);
            lines.push('```');
          }
          if (block.hasImage) lines.push('[Output included an image/screenshot]');
          break;
        }
      }
    }

    if (msg.hasFiles) {
      lines.push(`[Attached files: ${msg.fileNames.join(', ')}]`);
    }

    lines.push('└' + '─'.repeat(41));
    lines.push('');
  }

  lines.push('╔══════════════════════════════════════╗');
  lines.push('║        END OF TRANSFER               ║');
  lines.push('╚══════════════════════════════════════╝');
  lines.push('');
  lines.push('You now have the full conversation above. Please acknowledge receipt and continue from where it left off.');

  return lines.join('\n');
}

// ── Validation & sanitisation ────────────────────────────────────

function validateImportFile(parsed) {
  if (!parsed || typeof parsed !== 'object') throw new Error('Not a valid JSON object');
  if (!parsed.version) throw new Error('Missing version field');
  if (!Array.isArray(parsed.messages)) throw new Error('messages must be an array');
  if (!parsed.messages.length) throw new Error('No messages found');
  if (parsed.messages.length > CT.MAX_MESSAGES)
    throw new Error(`Too many messages (max ${CT.MAX_MESSAGES})`);
  if (!parsed.conversation?.title) throw new Error('Missing conversation metadata');
  return true;
}

function sanitizeText(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '[script removed]')
    .replace(/javascript:/gi, 'javascript_:')
    .replace(/on\w+\s*=/gi, 'on_event=');
}

function sanitizeImport(parsed) {
  parsed.conversation.title = sanitizeText(parsed.conversation.title);
  for (const msg of parsed.messages) {
    for (const block of msg.contentBlocks || []) {
      if (block.text)   block.text   = sanitizeText(block.text);
      if (block.code)   block.code   = sanitizeText(block.code);
      if (block.result) block.result = sanitizeText(block.result);
    }
  }
  return parsed;
}

function getCharCount(parsed) {
  let n = 0;
  for (const msg of parsed.messages)
    for (const b of msg.contentBlocks || [])
      n += (b.text || b.code || b.result || '').length;
  return n;
}
