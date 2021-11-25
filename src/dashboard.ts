import assert from 'assert';

import Vue from 'vue';
import { Terminal } from 'xterm';
import 'xterm/css/xterm.css';

import './tty.css';

// @ts-ignore
import appComponent from './components/app.vue';
import { App } from './components/app';
import { Shell } from './shell';
import { Batch, Scripts, BuildDirectory } from './batch';

import { ViviMap } from './infra/collections';


class DashboardApp {
    view: App
    tabs = new ViviMap<string, Tab>().withFactory(k => this._createTabFor(k))

    batch = new Batch

    constructor(containerId = '#app-container') {
        this.view = Vue.createApp(appComponent, {
                actions: Vue.reactive([]),
                onSelect: ({action}: {action: string}) => this.switchTo(action, true)
            })
            .mount(containerId) as Vue.ComponentPublicInstance & App;

        this.batch.on('scripts:loaded', async () => {
            this.view.actions.push(...this.batch.scripts.names);
            await Promise.resolve(); // now app has to update...
            var firstAction = this.batch.scripts.names[0];
            firstAction && this.switchTo(firstAction, true);
        });
        this.batch.on('script:done', ({scriptName: action, status}) => {
            this.view.status.set(action, status === 'ok' ? '✓' : '✗');
        })
    }

    startLocal(action: string) {
        var { shell } = this.batch.startLocalJob(action),
            tab = this.attach(action, shell);
        return tab;
    }

    switchTo(action: string, autostart = false) {
        var tab = this.tabs.get(action);
        this.view.selectAction(action);
        if (autostart) {
            if (!tab.controller) this.startLocal(action);
        }
        return tab;
    }

    attach(action: string, shell: Shell) {
        var tab = this.tabs.get(action);
        if (tab.controller)
            throw new Error(`'${action}' already has a running shell`);
        tab.controller = shell;
        shell.pipe(<any>tab.terminal as WritableStreamDefaultWriter);
        return tab;
    }

    _createTabFor(action: string) {
        var t = this._createTab();
        t.terminal.open(this.view.getTerminal(action));
        return t;
    }
    _createTab(): Tab {
        return {terminal: new Terminal({
            cols: 80,
            rendererType: 'dom',
            allowTransparency: true,
            theme: {
                background: 'transparent'
            }
        })};
    }
}


type Tab = {controller?: Shell, terminal: Terminal}
//type Terminal = any


function main() {
    if (!process.version)
        Object.assign(process, require('process'));

    var app = new DashboardApp();

    //remoteShell(terminal, app);
    nativeShell(app);

    Object.assign(window, {app});
}
/*
async function remoteShell(terminal: Terminal, app: App) {
    var host = location.host || 'localhost:3300',
        actions = await (await fetch(`http://${host}/actions`)).json();

    app.actions.push(...actions);

    await Promise.resolve(); // now app has to update...

    var w = new WebSocket(`ws://${host}`);

    w.addEventListener('open', () => {
        w.addEventListener('message', ev => terminal.write(ev.data));
        var action = actions[0];
        if (action) {
            app.selectAction(action);
            terminal.dom(app.getTerminal(action));
            w.send(action);
        }
    });

    Object.assign(window, {w});
}
*/

async function nativeShell(app: DashboardApp) {
    app.batch.loadScripts(new Scripts('data/just.json'));
}


document.addEventListener('DOMContentLoaded', main);
