import fs from 'fs';
import path from 'path';
import assert from 'assert';
import EventEmitter from 'events';
import pty from 'node-pty'; /* @kremlin.native */
import shellQuote from 'shell-quote';
import glob from 'glob';


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
        var {args: [file, ...args], env} = this.interp(cmd);

        if (!file) {
            Object.assign(this.env, env);
            return;
        }
        try {
            var bic = this.builtinCmds[file];
            if (bic) return bic(args);
            else
                return this.report(await this.spawn(file, args, env));
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

    interp(cmd: string): {args: string[], env: Env} {
        return this.splitEnv(
            [].concat(...this.parse(cmd)
                      .map(arg => this.expand(arg)))
        );
    }

    expand(arg: Arg): string[] {
        if (typeof arg === 'string') return [arg];
        else if (arg.pattern) return glob.sync(arg.pattern); /** @todo */
        else if (arg.comment) return [];
        else { console.warn('shell: unrecognized argument', arg); assert(false); }
    }

    splitEnv(args: string[]) {
        var env: Env = {}, i = 0;
        for (; i < args.length; i++) {
            var mo = args[i].match(/^(\w+)=(.*)$/);
            if (mo) env[mo[1]] = mo[2];
            else break;
        }
        return { args: args.slice(i), env };
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

    spawn(file: string, args: string[] = [], env: Env = {}, options: {} = {}): Promise<CommandExit> {
        var p = pty.spawn(file, args, {
            cwd: this.cwd,
            env: {...this.env, ...env},
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

type Arg = string | {pattern?: string, comment?: string};
type Env = {[varname: string]: string};
type CommandExit = {exitCode: number, signal?: number};


export { Shell }