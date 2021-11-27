import fs from 'fs';
import assert from 'assert';
import { EventEmitter } from 'events';
import { Shell, Env } from './shell';


class Batch extends EventEmitter {
    opts: Batch.Options
    buildDir: BuildDirectory

    scripts: Scripts

    lastState: { env: Env, vars: Env }

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
                this.lastState = {env: shell.env, vars: shell.vars};
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
        var shell = new Shell();
        if (this.buildDir.state == BuildDirectory.State.UNINIT) {
            if (this.opts.clean)
                this.buildDir.clean();
            this.buildDir.start();
        }
        shell.cwd = this.buildDir.dir;
        if (this.lastState) {
            shell.env = {...this.lastState.env};
            shell.vars = {...this.lastState.vars};
        }
        return shell;
    }
}

namespace Batch {
    export type Options = {
        clean?: boolean
    }
}


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