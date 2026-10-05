import fs from 'fs';
import assert from 'assert';
import { EventEmitter } from 'events';
import { Shell, Env, CommandExit } from './shell';
import { AgentConnection } from './remote/mcp-ssh/client';


class Batch extends EventEmitter {
    opts: Batch.Options
    buildDir: BuildDirectory

    scripts: Scripts

    lastState: Shell.State

    constructor(opts: Batch.Options = {}) {
        super();
        this.opts = {dir: '/tmp/mannequin', ...opts};
        this.buildDir = new BuildDirectory(this.opts.dir);
    }

    loadScripts(fn: string): void
    loadScripts(scripts: Scripts): void

    loadScripts(arg: string | Scripts) {
        assert(!this.scripts);
        this.scripts = (arg instanceof Scripts) ? arg : new Scripts(arg);
        this.emit('scripts:loaded', {arg});
    }

    startJob(scriptName: ActionSpecifier, remote?: AgentConnection) {
        var shell = this.createLocalShell(),
            script = this.scripts?.get(scriptName),
            startTime = Date.now();

        assert(Array.isArray(script));

        shell.remote = remote;
        if (remote) shell.env = {...remote.env};

        this.emit('script:start', {scriptName, startTime});

        var job = (async () => {
            await Promise.resolve(); // allow caller to set up event hooks

            var outcome = {scriptName, status: '', err: undefined,
                           startTime, endTime: -1, totalTime: 0};
            try {
                await shell.runScript(script);
                this.lastState = shell.state;
                outcome.status = 'ok';
            }
            catch (err) {
                outcome.status = 'err';
                outcome.err = err;
            }
            outcome.totalTime = (outcome.endTime = Date.now()) - startTime;

            this.emit('script:end', outcome);
            return outcome;
        })();

        return {shell, job};
    }

    async runActions(actions: string[], out?: Shell, state?: Shell.State) {    
        if (state) this.lastState = state;
        
        for (let action of actions) {
            var {shell, job} = this.startJob(action);
            out ? shell.forward(out)
                : shell.pipe(<any>process.stdout);
            var {status} = await job;
            if (status !== 'ok') break;
        }
    }

    parseActions(spec: string[]) {
        if (spec.length === 0) return this.scripts.names;
        else return [].concat(...spec.map(nm => {
            var dots = nm.split(/\.\.+/);
            if (dots.length == 1) return [nm];
            else if (dots.length == 2) {
                function find(name: string) {
                    var idx = names.indexOf(name);
                    if (idx < 0) throw new Error(`action not found: '${name}'`);
                    return idx;
                }
                var names = this.scripts.names,
                    from = dots[0] ? find(dots[0]) : 0,
                    to = dots[1] ? find(dots[1]) : Infinity;
                return names.slice(from, to + 1);
            }
            if (dots.length > 2) throw new Error(`too many dots: '${nm}'`);
        }));
    }

    createLocalShell() {
        var shell = this.opts.dry ? new Batch.DryRunShell() : new Shell();
        if (this.buildDir.state == BuildDirectory.State.UNINIT) {
            if (this.opts.clean)
                this.buildDir.clean();
            this.buildDir.start();
        }
        shell.cwd = this.buildDir.dir;
        if (this.lastState)
            shell.state = this.lastState;
        shell.builtinCmds['@'] = async (args: string[]) => {
            let actions = this.parseActions(args);
            await this.runActions(actions, shell, shell.state);
        };
        return shell;
    }
}

namespace Batch {
    export type Options = {
        dir?: string
        clean?: boolean
        dry?: boolean
    }

    /**
     * Overrides `spawn` to just print the expanded command line.
     */
    export class DryRunShell extends Shell {
        async spawn(file: string, args: string[] = [], env: Env = {},
                    stdin: string = undefined, options: {} = {}): Promise<CommandExit> {

            this.emit('data', [file, ...args].join('\n    '));

            return {exitCode: 0, signal: undefined};
        }
    }
}

type ActionSpecifier = string | string[]


class Scripts {
    defs: {
        "scripts": Scripts.Bundle
        "optional-scripts": Scripts.Bundle
        "recipes": Scripts.Bundle
    }

    constructor(fn: string) {
        this.defs = JSON.parse(fs.readFileSync(fn, 'utf-8'));
        /* kebab-case */
        //if (this.defs['optional-scripts'])
        //    this.defs.optionalScripts = this.defs['optional-scripts'];
    }

    get names() {
        function *aux(o: Scripts.Bundle) {
            for (let [k, v] of Object.entries(o)) {
                if (Array.isArray(v)) yield [k];
                else for (let kn of aux(v)) yield [k, ...kn];
            }
        }
        return [...aux(this.defs.scripts)];
    }

    get(name: ActionSpecifier) {
        var searchIn = Scripts.SECTIONS;
        return searchIn.map(k => this.nested(this.defs[k], name))
                       .find(x => x) ?? [name];
    }

    nested(bundle: Scripts.Bundle, qualifiedName: ActionSpecifier) {
        let o: Scripts.Bundle[string] = bundle;
        for (let k of Array.isArray(qualifiedName) ? qualifiedName : [qualifiedName]) {
            if (o && !Array.isArray(o))
                o = o[k];
            else
                return undefined;
        }
        return o;
    }
}

namespace Scripts {
    export type Sections = 'scripts' | 'optional-scripts' | 'recipes';
    export const SECTIONS = ['scripts', 'optional-scripts', 'recipes'];
    export type Bundle = {[name: string]: string[] | Bundle};
}


class BuildDirectory {
    dir: string
    state = BuildDirectory.State.UNINIT

    constructor(dir: string) { this.dir = dir; }

    clean() {
        this.state = BuildDirectory.State.UNINIT;
        return fs.promises.rm(this.dir, {recursive: true, force: true});
    }

    start() {
        fs.mkdirSync(this.dir, {recursive: true});
        this.state = BuildDirectory.State.STARTED;
    }
}

namespace BuildDirectory {
    export enum State { UNINIT, STARTED };
}


export { Batch, ActionSpecifier, Scripts, BuildDirectory }