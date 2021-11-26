import fs from 'fs';
import path from 'path';
import assert from 'assert';
import EventEmitter from 'events';
import pty from 'node-pty'; /* @kremlin.native */
import shellQuote from 'shell-quote';
import glob from 'glob';


class Shell extends EventEmitter {
    cwd: string
    env: Env
    vars: Env = {}
    term: {}

    constructor() {
        super();
        this.cwd = process.cwd();
        this.env = {...process.env};
        this.term = {
            name: 'xterm-color',
            cols: 80,
            rows: 30,
        };    
    }

    async run(cmd: ScriptEntry) {
        if (typeof cmd === 'string' || Array.isArray(cmd))
            return this._run(cmd);
        else
            return this._run(cmd._, cmd);
    }

    async _run(cmd: CommandInput, opts: CommandOptions = {}) {
        this.env['PWD'] = this.cwd;

        var {args: [file, ...args], env} = this.interp(cmd);

        if (!file) {
            /** @todo add distinction between shell vars and env vars (`export`) */
            Object.assign(this.vars, env);
            Object.assign(this.env, env);
            return;
        }
        
        try {
            var bic = this.builtinCmds[file];
            if (bic) return bic(args);
            else
                return this.report(await this.spawn(file, args, env));
        }
        catch (e) {
            this.report(e);
            if (opts.fail != 'continue') throw e;  // 'stop' is the default
            else this.emit('message', '(continuing anyway)');
        }
    }

    async runScript(cmds: ScriptEntry[]) {
        for (let cmd of cmds) {
            await this.run(cmd);
        }
    }

    parse(cmd: CommandInput): Arg[] {
        if (Array.isArray(cmd))
            return [].concat(...cmd.map(ln => this.parse(ln)));
        else
            return shellQuote.parse(cmd, this.env);
    }

    interp(cmd: CommandInput): {args: string[], env: Env} {
        return this.splitEnv(
            [].concat(...this.parse(cmd)
                      .map(arg => this.expand(arg)))
        );
    }

    expand(arg: Arg): Arglet[] {
        if (typeof arg === 'string' || arg.op) return [arg];
        else if (arg.pattern) return glob.sync(arg.pattern); /** @todo */
        else if (arg.comment) return [];
        else { console.warn('shell: unrecognized argument', arg); assert(false); }
    }

    splitEnv(args: Arglet[]) {
        var env: Env = {}, i = 0;
        for (; i < args.length; i++) {
            let arg = args[i];
            if (typeof arg === 'string') {
                var mo = arg.match(/^(\w+)=(.*)$/);
                if (mo) {
                    var key = mo[1], val = mo[2];
                    if (val == '' && this._op(args[i + 1]) == '(') {
                        [i, val] = this._gobble(args, i + 2)
                    }
                    env[key] = val;
                }
                else break;
            }
            else break;
        }
        return { args: args.slice(i).map(s => this._str(s)), env };
    }

    _op(a: Arg) {
        return (typeof a === 'string') ? undefined : a?.op;
    }

    _str(a: Arg) {
        return (typeof a === 'string') ? a : '';
    }

    /** reads args up to close paren */
    _gobble(args: Arglet[], start: number): [number, string] {
        var i = start;
        for (; i < args.length; i++) {
            if (this._op(args[i]) === ')') break;
        }
        var val = args.slice(start, i).map(s => this._str(s)).join(" ")
        if (i < args.length) i++;
        return [i, val];
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

type Arg = string | {pattern?: string, comment?: string, op?: string};
type Arglet = string | {op?: string};
type Env = {[varname: string]: string};
type ScriptEntry = CommandInput | {_: CommandInput} & CommandOptions;
type CommandInput = string | string[];
type CommandOptions = {fail?: 'stop' | 'continue'};
type CommandExit = {exitCode: number, signal?: number};


export { Shell, Env }