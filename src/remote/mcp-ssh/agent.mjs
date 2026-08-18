import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { spawn } from 'child_process';

// Initialize the MCP server and declare that it supports logging
const server = new Server(
    { name: 'remote-process-agent', version: '1.0.0' },
    { capabilities: { tools: {}, logging: {} } }
);

// Register our execution tool
server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [{
        name: 'run_stream',
        description: 'Run a shell command and stream output in real-time',
        inputSchema: {
            type: 'object',
            properties: { command: { type: 'string' } },
            required: ['command']
        }
    }]
}));

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
    switch (request.params.name) {
    case 'run_stream':
        const { jid, file, args, options } = request.params.arguments,
              stdin = Array.isArray(options?.stdin) ? options.stdin : undefined,
              stdio = [stdin ? 'pipe' : 'ignore', 'pipe', 'pipe'];

        const proc = spawn(file, args, {stdio, ...options, env: {...process.env, ...options?.env}}),
              pid = proc.pid;

        // Stream stdout/stderr back to the client via MCP's logging channel
        for (let [s, stream, level] of [[proc.stdout, 'stdout', 'info'], 
                                        [proc.stderr, 'stderr', 'error']]) {
            if (s)
                s.on('data', (chunk) =>
                    server.sendLoggingMessage({
                        level,
                        data: {jid, pid, stream, chunk: encodeBytes(chunk)}
                    })
                );
        }

        // The tool call remains "pending" until the promise resolves
        return new Promise((resolve, reject) => {
            proc.on('close', (code) =>
                resolve({jid, pid, code}));
            proc.on('error', e => resolve({jid, pid, error: e.toString()}));
        });
    case 'env':
        return {result: process.env};
    }
    throw new Error('Tool not found');
});

/**
 * Encode an array of bytes as a "byte-string" (Latin-1), escaping any non-
 * printable characters.
 * @see decodeBytes (client.ts)
 */
function encodeBytes(bytes) {
    let stringOfBytes = "";
    const CHUNK_SIZE = 8192; // 8KB chunks are safely below the call stack limit
    
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
        stringOfBytes += String.fromCharCode.apply(null,
            bytes.subarray(i, i + CHUNK_SIZE));
    }
    return stringOfBytes;
}


// Connect to stdio
const transport = new StdioServerTransport();
await server.connect(transport);