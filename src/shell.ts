import fs from 'fs';
import path from 'path';
import assert from 'assert';
import EventEmitter from 'events';
import pty from 'node-pty'; /* @kremlin.native */
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
        var [file, ...args] = [].concat(...this.parse(cmd)
            .map(arg => this.expand(arg)));
        try {
            var bic = this.builtinCmds[file];
            if (bic) return bic(args);
            else
                return this.report(await this.spawn(file, args));
        }
        catch (e) { throw this.report(e); }
    }

    async runScript(cmds: string[]) {
        for (let cmd of cmds) {
            await this.run(cmd);
        }
    }

    parse(cmd: string): Arg[] {
        return shellQuote.parse(cmd);
    }

    expand(arg: Arg): string[] {
        if (typeof arg === 'string') return [arg];
        else if (arg.pattern) return [arg.pattern]; /** @todo */
        else assert(false);
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
        var p = pty.spawn(file, args, {
            cwd: this.cwd,
            env: this.env,
            ...this.term, ...options
        });

        p.onData(d => this.emit('data', d));
        return new Promise((resolve, reject) =>
            p.onExit(e => e.signal || e.exitCode ? reject(e) : resolve(e)));
    }

    builtinCmds = {
        cd: (args: string[]) => {
            if (args.length != 1)
                throw new Error('cd: wrong number of arguments');
            this.cwd = path.resolve(this.cwd, args[0])
        }
    }
}

type Arg = string | {pattern: string}
type CommandExit = {exitCode: number, signal?: number}


class Scripts {
    defs: {scripts: {[name: string]: string[]}}

    constructor(fn: string) {
        this.defs = JSON.parse(fs.readFileSync(fn, 'utf-8'));
    }

    get names() {
        return Object.keys(this.defs.scripts);
    }

    get(name: string) {
        return this.defs.scripts[name] || [name];
    }
}


export { Shell, Scripts }