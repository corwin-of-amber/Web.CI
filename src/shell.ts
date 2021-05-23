import fs from 'fs';
import EventEmitter from 'events';
import shellQuote from 'shell-quote';


class Shell extends EventEmitter {
    cwd: string
    env: {[name: string]: string}
    term: {}

    constructor() {
        super();
        this.cwd = process.cwd();
        this.env = process.env;
        this.term = {
            name: 'xterm-color',
            cols: 80,
            rows: 30,
        };    
    }

    async run(cmd: string) {
        var [file, ...args] = this.parse(cmd);
        try {
            return this.report(await this.spawn(file, args));
        }
        catch (e) { throw this.report(e); }
    }

    async runScript(cmds: string[]) {
        for (let cmd of cmds) {
            await this.run(cmd);
        }
    }

    parse(cmd: string): string[] {
        return shellQuote.parse(cmd);
    }

    report(e: CommandExit) {
        if (e.signal) this.emit('message', `Signal ${e.signal}`);
        else if (e.exitCode) this.emit('message', `\nExit ${e.exitCode}.`);
        else this.emit('message', `\u2756`);  // ❖
        return e;
    }

    pipe(out: WritableStreamDefaultWriter) {
        var flg = false;
        this.on('data', d => {
            if (flg) out.write('\r\n\n'); flg = false;
            out.write(d);
        });
        this.on('message', m => {
            out.write(`\r\n${m}`); flg = true; });    
        return this;
    }

    spawn(file: string, args: string[] = [], options: {} = {}): Promise<CommandExit> {
        const pty = (0||require)('node-pty') as typeof import('node-pty');

        var p = pty.spawn(file, args, {
            cwd: this.cwd,
            env: this.env,
            ...this.term, ...options
        });

        p.onData(d => this.emit('data', d));
        return new Promise((resolve, reject) =>
            p.onExit(e => e.signal || e.exitCode ? reject(e) : resolve(e)));
    }
}

type CommandExit = {exitCode: number, signal?: number}


class Scripts {
    defs: {scripts: {[name: string]: string[]}}

    constructor(fn: string) {
        this.defs = JSON.parse(fs.readFileSync(fn, 'utf-8'));
    }

    get(name: string) {
        return this.defs.scripts[name] || [name];
    }
}


export { Shell, Scripts }