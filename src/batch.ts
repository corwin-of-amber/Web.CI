import fs from 'fs';
import assert from 'assert';
import { EventEmitter } from 'events';
import { Shell, Env, CommandExit } from './shell';


class Batch extends EventEmitter {
    opts: Batch.Options
    buildDir: BuildDirectory

    scripts: Scripts

    lastState: Shell.State

    constructor(opts: Batch.Options = {}) {
        super();
        this.opts = opts;
        this.buildDir = new BuildDirectory('/tmp/mannequin');
    }

    loadScripts(fn: string): void
    loadScripts(scripts: Scripts): void

    loadScripts(arg: string | Scripts) {
        assert(!this.scripts);
        this.scripts = (arg instanceof Scripts) ? arg : new Scripts(arg);
        this.emit('scripts:loaded', {arg});
    }

    startLocalJob(scriptName: string) {
        var shell = this.createLocalShell(),
            script = this.scripts?.get(scriptName),
            startTime = Date.now();

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
            var {shell, job} = this.startLocalJob(action);
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
        return Object.keys(this.defs.scripts);
    }

    get(name: string) {
        var searchIn = Scripts.SECTIONS;
        return searchIn.map(k => this.defs[k]?.[name])
                       .find(x => x) ?? [name];
    }
}

namespace Scripts {
    export type Sections = 'scripts' | 'optional-scripts' | 'recipes';
    export const SECTIONS = ['scripts', 'optional-scripts', 'recipes'];
    export type Bundle = {[name: string]: string[]};
}


class BuildDirectory {
    dir: string
    state = BuildDirectory.State.UNINIT

    constructor(dir: string) { this.dir = dir; }

    clean() {
        fs.rmSync(this.dir, {recursive: true, force: true});
    }

    start() {
        fs.mkdirSync(this.dir, {recursive: true});
        this.state = BuildDirectory.State.STARTED;
    }
}

namespace BuildDirectory {
    export enum State { UNINIT, STARTED };
}


export { Batch, Scripts, BuildDirectory }