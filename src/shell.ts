import fs from 'fs';
import path from 'path';
import assert from 'assert';
import EventEmitter from 'events';
import child_process from 'child_process';
import pty from 'node-pty'; /* @kremlin.native */
import shellQuote from 'shell-quote';
import shellParse from 'shell-parse';
import glob from 'glob';


class Shell extends EventEmitter {
    cwd: string
    env: Env
    vars: Env = {}
    varsPrec: VariablePrecedence = {}
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
         return await this._runExpanded(cmd, this.interp(cmd), opts);
    }

    async _runParsed(cmd: CommandInput, parsed: ParsedCommand, opts: CommandOptions = {}) {
        return await this._runExpanded(cmd, this._interpParsed(parsed), opts);
    }

    async _runExpanded(cmd: CommandInput, ecmd: ExpandedCommand, opts: CommandOptions = {}) {
        var {cmds, stdin} = ecmd;

        if (cmds.length == 0) return; // nop
        else if (cmds.length > 1) {
            throw new Error('not implemented'); // sorry ma
        }

        var {args: [file, ...args], env} = cmds[0];

        if (!file) {
            if (opts.precedence !== 'override')
                env = filterKeys(env, k => this.varsPrec[k] != 'override');
            Object.assign(this.vars, env);
            Object.assign(this.env, env);
            Object.assign(this.varsPrec,
                mapValues(env, _ => opts.precedence ?? 'export'));
            return;
        }

        this.reportStart(cmd);
        
        try {
            var bic = this.builtinCmds[file];
            if (bic) return bic(args);
            else
                return this.reportEnd(await this.spawn(file, args, env, stdin));
        }
        catch (e) {
            this.reportEnd(e);
            if (opts.fail != 'continue') throw e;  // 'stop' is the default
            else {
                this.emit('message', '(continuing anyway)');
                return e;
            }
        }
    }

    async runScript(cmds: ScriptEntry[]) {
        for (let cmd of cmds) {
            await this.run(cmd);
        }
    }

    fork(): Shell
    fork<T extends Shell>(child: T): T

    fork(child = new Shell) {
        child.cwd = this.cwd;
        child.env = {...this.env};
        child.term = {...this.term};
        return child;
    }

    /**
     * Handles line comments (`#`) and `<<` input redirection.
     */
    preparse(cmd: CommandInput): PreparsedCommand {
        if (Array.isArray(cmd)) {
            for (let i = 0; i < cmd.length; i++) {
                if (cmd[i].match(/^\s*#/)) {
                    return {cmd: cmd.slice(0, i)};
                }
                var redir = cmd[i].match(/^(.*)<<\s*$/);
                if (redir) {
                    return {
                        cmd: [...cmd.slice(0, i), redir[1]],
                        stdin: cmd.slice(i + 1).join('\n')
                    };
                }
            }
        }
        else if (cmd.match(/^\s*#/)) return {cmd: []};
        return {cmd};
    }

    parse(cmd: CommandInput): ParsedCommand {
        var pre = this.preparse(cmd);
        return {cmds: this._parse(pre.cmd), stdin: pre.stdin};
    }

    _parse(cmd: CommandInput): Expansion.Statement.Command[] {
        if (Array.isArray(cmd)) cmd = cmd.join(' '); // this is needed because quotes may span multiple lines
        if (cmd.match(/^\s*$/)) return [];
        var arrmo = cmd.match(/^(\w+)=\(/);
        return arrmo ? [this._arrayAssign(cmd, arrmo)] : shellParse(cmd);
    }

    interp(cmd: CommandInput): ExpandedCommand {
        return this._interpParsed(this.parse(cmd));
    }

    _interpParsed(parsed: ParsedCommand) {
        this.env['PWD'] = this.cwd;  // needed for variable expansion
        var cmds = parsed.cmds.map(cmd => this._interp(cmd));
        return {cmds, stdin: parsed.stdin};
    }

    _interp(cmd: Expansion.Statement): {args: string[], env: Env} {
        if (Expansion.Statement.is(cmd, 'command')) {
            return {
                args: this._eval([cmd.command, ...cmd.args]),
                env: mapValues(cmd.env, v => this._eval(v).join(''))
            }
        }
        else if (Expansion.Statement.is(cmd, 'variableAssignment')) {
            var value = Array.isArray(cmd.value) ? cmd.value : [cmd.value];
            return {
                args: [],
                env: {[cmd.name]: this._eval(value).join(' ')}
            }
        }
        else if (Array.isArray(cmd)) {
            let env = {};
            for (let assign of cmd)
                Object.assign(env, this._interp(assign).env);
            return {args: [], env}
        }
        else {
            console.warn('shell: cannot interpret', cmd);
            return {args: [], env: {}}
        }
    }

    _eval(cmd: Expansion.Arg | Expansion.Arg[]) {
        var subsh = (cmds: Expansion.Statement[]) => this.subshell(cmds);
        return Array.isArray(cmd) ? Expansion.eval_(cmd, this.env, subsh)
            : Expansion.evalOne(cmd, this.env, subsh);
    }

    /** parse array assignment, which is not natively supported by shell-parse */
    _arrayAssign(cmd: string, mo: RegExpMatchArray): Expansion.Statement.VariableAssignment {
        var clo = cmd.match(/\)\s*$/);
        if (!clo) throw new Error(`unmatched '('`);
        var value = {
            type: 'array',
            expression: this._arrayParse(cmd.substring(mo[0].length, clo.index))
        };
        return {
            type: 'variableAssignment',
            name: mo[1],
            value,
            control: ';', next: null
        }
    }

    _arrayParse(substr: string) {
        var parsed = shellParse('x ' + substr);
        assert(parsed.length === 1 && parsed[0].type === 'command');
        return parsed[0].args;
    }

    reportStart(cmd: CommandInput) {
        if (Array.isArray(cmd)) cmd = cmd.join('\n');
        this.emit('message', cmd);
    }

    reportEnd(e: CommandExit) {
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

    forward(other: Shell) {
        this.on('data', d => other.emit('data', d));
        this.on('message', d => other.emit('message', d));
    }

    spawn(file: string, args: string[] = [], env: Env = {},
          stdin: string = undefined, options: {} = {}): Promise<CommandExit> {
        return stdin ? this.spawnChild(file, args, env, stdin, options)
                     : this.spawnPty(file, args, env, stdin, options);
    }

    spawnPty(file: string, args: string[] = [], env: Env = {},
             stdin: string = undefined, options: {} = {}): Promise<CommandExit> {
        var p = pty.spawn(file, args, {
            cwd: this.cwd,
            env: {...this.env, ...env},
            ...this.term, ...options
        });

        p.onData(d => this.emit('data', d));
        if (typeof stdin === 'string') { p.write(stdin); p.write('\n\x04'/*EOF*/); }
        return new Promise((resolve, reject) =>
            p.onExit(e => e.signal || e.exitCode ? reject(e) : resolve(e)));
    }

    spawnChild(file: string, args: string[] = [], env: Env = {},
               stdin: string = undefined, options: {} = {}): Promise<CommandExit> {
        var c = child_process.spawn(file, args, {
            cwd: this.cwd,
            env: {...this.env, ...env},
            stdio: ['pipe', 'pipe', 'pipe'],
            ...options
        });

        for (let s of [c.stdout, c.stderr])
            s.on('data', d => this.emit('data', d));
        if (stdin) c.stdin.write(stdin);
        c.stdin.end();

        return new Promise((resolve, reject) =>
            c.on('exit', (exitCode, signal) => {
                var e = {exitCode, signal};
                e.signal || e.exitCode ? reject(e) : resolve(e)
            }));
    }

    subshell(cmds: Expansion.Statement[]) {
        var subsh = this.fork(new SynchronousShell());
        subsh.on('data', d => console.log('***', d));
        subsh._runParsed(null, {cmds});
        return subsh.captured;
    }

    get state(): Shell.State {
        return {env: this.env, vars: this.vars, varsPrec: this.varsPrec};
    }

    set state(s: Shell.State) {
        this.env = {...s.env};
        this.vars = {...s.vars};
        this.varsPrec = {...s.varsPrec};
    }

    builtinCmds = {
        cd: (args: string[]) => {
            if (args.length != 1)
                throw new Error('cd: wrong number of arguments');
            this.cwd = path.resolve(this.cwd, args[0])
        }
    }
}

namespace Shell {
    export type State = {env: Env, vars: Env, varsPrec: VariablePrecedence};
    export type BuiltinCmds = {
        [name: string]: (args: string[]) => void | Promise<void>
    }
}

/**
 * A synchronous version of `Shell` for running subcommands during expansion.
 * 
 * @ops Command substitution should probably be deferred until later, when the
 * command is actually executed.
 */
class SynchronousShell extends Shell {
    _captured: string[] = []

    spawn(file: string, args: string[] = [], env: Env = {},
          stdin: string = undefined, options: {} = {}): Promise<CommandExit> {

        assert(!stdin, 'not implemented');

        var ret = child_process.spawnSync(file, args,{
            cwd: this.cwd,
            env: {...this.env, ...env},
            stdio: ['pipe', 'pipe', 'pipe'],
            ...options
        });
        if (ret.error)
            console.warn(`\n[in subshell] ${ret.error}`);

        if (ret.stdout)
            this._captured.push(ret.stdout.toString('utf-8'));

        if (ret.stderr?.length > 0)
            console.warn(`\n[in subshell] ${ret.stderr.toString('utf-8')}`);

        // Swallows any errors
        return Promise.resolve({signal: 0, exitCode: 0});
    }

    get captured() {
        return this._captured.join('');
    }
}

//type Arg = string | {pattern?: string, comment?: string, op?: string};
//type Arglet = string | {op?: string};
type Env = {[varname: string]: string};
type VariablePrecedence = {[varname: string]: 'local' | 'export' | 'override'};
type ScriptEntry = CommandInput | {_: CommandInput} & CommandOptions;
type CommandInput = string | string[];
type CommandOptions = {fail?: 'stop' | 'continue', precedence?: 'override'};
type CommandExit = {exitCode: number, signal?: number | NodeJS.Signals};

type PreparsedCommand = {
    cmd: CommandInput
    stdin?: string
};

type ParsedCommand = {
    cmds: Expansion.Statement[]
    stdin?: string
};

type ExpandedCommand = {
    cmds: {
        args: string[]
        env: Env
    }[]
    stdin?: string
};


namespace Expansion {

    export function eval_(args: Arg[], env: Env, sh?: (cmds: Statement[]) => string) {
        return [].concat(...args.map(a => evalOne(a, env, sh)));
    }

    export function evalOne(arg: Arg, env: Env, sh?: (cmds: Statement[]) => string): string[] {
        if (Arg.is(arg, 'literal')) {
            return [arg.value];
        }
        else if (Arg.is(arg, 'variable')) {
            let v = env[arg.name];
            /** @todo need to distinguish between quoted an unquoted; */
            /* currently, `shell-parse` does not convey this information. */
            return v ? [v] : [];
        }
        else if (Arg.is(arg, 'variableSubstitution')) {
            /** @todo stub; need to parse the expression */
            let v = env[arg.expression];
            return v ? [v] : [];
        }
        else if (Arg.is(arg, 'commandSubstitution')) {
            return [cleanup(sh?.(arg.commands)) ?? '<-n/a->'];
        }
        else if (Arg.is(arg, 'concatenation')) {
            /** @todo stub; assumes all expansions are zero- or one-length */
            let v = eval_(arg.pieces, env, sh);
            return v.length ? [v.join('')] : [];
        }
        else if (Arg.is(arg, 'array')) {
            return eval_(arg.expression, env, sh)
        }
        else {
            console.log('shell: cannot evaluate', arg);
            return [];
        }
    }

    function cleanup(s: string) {
        return s && s.replace(/\n+/g, '').trim();
    }

    function stringify(arg: Arg) {
        if (Arg.is(arg, 'literal')) {
            return arg.value;
        }
        else if (Arg.is(arg, 'variable')) {
            return `$${arg.name}`
        }
        else if (Arg.is(arg, 'variableSubstitution')) {
            return `\${${arg.expression}}`
        }
        else if (Arg.is(arg, 'concatenation')) {
            return arg.pieces.map(stringify).join('');
        }
        else {
            console.warn('shell: cannot stringify', arg);
            return '';
        }
    }

    export interface Statement {
        type: 'command' | 'variableAssignment'
        control: ';'
        next: any
    }

    export namespace Statement {
        export interface Command extends Statement {
            type: 'command'
            command: Arg
            args: Arg[]
            env: {[varname: string]: Arg}
            redirects: any
        }

        export interface VariableAssignment extends Statement {
            type: 'variableAssignment'
            name: string
            value: Arg
        }

        export function is(arg: Statement, type: 'command'): arg is Command;
        export function is(arg: Statement, type: 'variableAssignment'): arg is VariableAssignment;
        export function is(arg: Statement, type: string) {
            return arg.type === type;
        }
    }

    export interface Arg {
        type: string
    }
    
    export namespace Arg {
        export interface Literal {
            type: 'literal'
            value: string
        }
        export interface Variable {
            type: 'variable'
            name: string
        }
        export interface VariableSubst {
            type: 'variableSubstitution'
            expression: string
        }
        export interface CommandSubst {
            type: 'commandSubstitution'
            commands: Statement[]
        }
        export interface Concat extends Arg {
            type: 'concatenation'
            pieces: Arg[]
        }
        export interface Array extends Arg {
            type: 'array'
            expression: Arg[]
        }

        export function is(arg: Arg, type: 'literal'): arg is Literal;
        export function is(arg: Arg, type: 'variable'): arg is Variable;
        export function is(arg: Arg, type: 'variableSubstitution'): arg is VariableSubst;
        export function is(arg: Arg, type: 'commandSubstitution'): arg is CommandSubst;
        export function is(arg: Arg, type: 'concatenation'): arg is Concat;
        export function is(arg: Arg, type: 'array'): arg is Array;
        export function is(arg: Arg, type: string) {
            return arg.type === type;
        }
    }
}

/** some boilerplate */
function mapValues<T, S>(o: {[k: string]: T}, f: (v: T) => S): {[k: string]: S} {
    return Object.fromEntries(
        Object.entries(o).map(([k, v]) => [k, f(v)])
    )
}

function filterKeys<T>(o: {[k: string]: T}, p: (k: string) => boolean): {[k: string]: T} {
    return Object.fromEntries(
        Object.entries(o).filter(([k, v]) => p(k))
    )
}

// for debugging
if (typeof window === 'object')
    Object.assign(window, {shellQuote, shellParse});


export { Shell, Env, CommandOptions, CommandExit }