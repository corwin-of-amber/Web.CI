import fs from 'fs';
import assert from 'assert';
import { EventEmitter } from 'events';
import { Shell } from './shell';


class Batch extends EventEmitter {
    opts: Batch.Options
    buildDir: BuildDirectory

    scripts: Scripts

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
            script = this.scripts?.get(scriptName);

        var job = (async () => {
            try {
                await shell.runScript(script);
                this.emit('script:done', {scriptName, status: 'ok'});
            }
            catch (err) {
                this.emit('script:done', {scriptName, status: 'err', err});
            }
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