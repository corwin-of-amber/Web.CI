import fs from 'fs';
import assert from 'assert';
import { EventEmitter } from 'events';
import { Shell, ShellState, Env, CommandExit } from './shell';


class Batch extends EventEmitter {
    opts: Batch.Options
    buildDir: BuildDirectory

    scripts: Scripts

    lastState: ShellState

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
        scripts: {[name: string]: string[]},
        optionalScripts: {[name: string]: string[]}
    }

    constructor(fn: string) {
        this.defs = JSON.parse(fs.readFileSync(fn, 'utf-8'));
        /* kebab-case */
        if (this.defs['optional-scripts'])
            this.defs.optionalScripts = this.defs['optional-scripts'];
    }

    get names() {
        return Object.keys(this.defs.scripts);
    }

    get(name: string) {
        return this.defs.scripts[name] ??
               this.defs.optionalScripts[name] ?? [name];
    }
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