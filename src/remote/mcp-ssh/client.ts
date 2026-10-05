import { EventEmitter } from 'events';
import type { SpawnOptions } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client'; /** @kremlin.native */
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'; /** @kremlin.native */
import { LoggingMessageNotificationSchema } from '@modelcontextprotocol/sdk/types.js'; /** @kremlin.native */
import { Env } from '../../shell';


class AgentConnection {
    client: Client
    transport: StdioClientTransport
    ready: Promise<void>
    env: Env = {}

    tasks = new Map<number, Task>()

    constructor(host: string, opts: AgentConnectionOptions = {}) {
        this.client = new Client(
            { name: 'local-ssh-client', version: '1.0.0' }
        );
        this.transport = new StdioClientTransport({
            command: 'ssh',
            args: [
                '-q', ...(opts.sshFlags ?? []),
                host,
                /** @todo upload agent and then launch */
                'bash -l -c "node var/workspace/Web.CI/src/remote/mcp-ssh/agent.mjs"' 
            ]
        });

        this.client.setNotificationHandler(LoggingMessageNotificationSchema, (request) => {
            const log: any = request.params.data;
            console.log('notification', log);
            if (typeof log.jid === 'number') {
                let task = this.tasks.get(log.jid);
                if (task) {
                    (log.stream === 'stdout' ? task.stdout : task.stderr)
                        .emit('data', decodeBytes(log.chunk));
                }
            }
        });

        this.ready = this.init();
    }

    async init() {
        await this.client.connect(this.transport);
    }

    async close() {
        await this.transport.close();
    }

    /**
     * Resolves only when the process finishes. During execution,
     * log events are sent.
     */
    spawn(file: string, args: string[] = [], options: SpawnOptions & {stdin?: string} = {}) {
        const jid = ++this._jid, task = new Task;
        this.tasks.set(jid, task);

        task.finished = this.client.callTool({
            name: "run_stream",
            arguments: {jid, file, args, options}
        }, undefined, {timeout: 3600e3});
        return task;
    }
    
    _jid = 0

    async getEnv() {
        return this.env =
            (await this.client.callTool({name: "env"})).result as Env;
    }
}


class Task {
    stdout = new EventEmitter
    stderr = new EventEmitter
    finished: Promise<any>
}

interface AgentConnectionOptions {
    sshFlags?: string[]
}

/**
 * The agents encodes bytes in "byte-strings" (Latin-1) where non-printable
 * characters are escaped. This function reverses the process.
 * @see encodeBytes (agent.mjs)
 */
function decodeBytes(str: string): Uint8Array {
    const byteArray = new Uint8Array(str.length);
            
    for (let i = 0; i < str.length; i++) {
        byteArray[i] = str.charCodeAt(i);
    }

    return byteArray;
}


export { AgentConnection }