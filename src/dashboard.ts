import * as Vue from 'vue';
import { Terminal } from 'xterm';
import 'xterm/css/xterm.css';

import './tty.css';

import appComponent, { IApp } from './components/app.vue';
import { Shell } from './shell';
import { Batch, Scripts, ActionSpecifier } from './batch';
import { AgentConnection } from './remote/mcp-ssh/client';

import { ViviMap } from './infra/collections';


class DashboardApp {
    view: IApp
    tabs = new ViviMap<string, Tab>().withFactory(k => this._createTabFor(k))

    batch = new Batch
    agent?: AgentConnection

    constructor(containerId = '#app-container') {
        this.view = Vue.createApp(appComponent, {
                actions: Vue.reactive([]),
                onSelect: ({action}: {action: string}) => this.switchTo(action),
                onAction: ({type}) => this.onToolbarAction(type)
            })
            .mount(containerId) as IApp;

        this.batch.on('scripts:loaded', async () => {
            this.view.actions.push(...this.batch.scripts.names);
            requestAnimationFrame(() => {
                var firstAction = this.batch.scripts.names[0];
                firstAction && this.switchTo(firstAction);
            });
        });
        this.batch.on('script:done', ({scriptName: action, status}) => {
            this.view.status.set(action, status === 'ok' ? '✓' : '✗');
        });
        // Cleanup
        window.addEventListener('beforeunload', () => this.stopAll());
    }

    async connect(host: string, proxy: string = '127.0.0.1:1080') {
        let ac = new AgentConnection(host, {
            sshFlags: ['-o', `ProxyCommand=nc -X 5 -x ${proxy} %h %p`]
        });
        await ac.ready;

        console.log(await ac.getEnv());
        this.agent = ac;
    }

    disconnect() {
        this.agent.close();
    }

    async startLocal(action: string) {
        await this.stop(action);  // in case any previous job is still attached

        let { shell } = this.batch.startJob(action, this.agent),
            tab = this.attach(action, shell);
        return tab;
    }

    switchTo(action: string, autostart = false) {
        console.log('switchTo', action)
        var tab = this.tabs.get(this._actionKey(action));
        this.view.selectAction(action);
        if (autostart) {
            if (!tab.controller) this.startLocal(action);
        }
        return tab;
    }

    attach(action: string, shell: Shell) {
        var tab = this.tabs.get(this._actionKey(action));
        if (tab.controller)
            throw new Error(`'${action}' already has a running shell`);
        tab.controller = shell;
        shell.pipe(<any>tab.terminal as WritableStreamDefaultWriter);
        return tab;
    }

    async stop(action: string) {
        var tab = this.tabs.get(this._actionKey(action));
        await tab.controller?.stop();
        tab.controller = undefined;        
    }

    stopAll() {
        for (let tab of this.tabs.values()) {
            tab.controller?.stop();
        }
    }

    reset() {
        for (let tab of this.tabs.values()) {
            tab.terminal.clear();
            tab.controller = undefined;
        }
    }

    async onToolbarAction(type: string) {
        switch (type) {
            case 'start':
                this.startLocal(this.view.selected);
                break;
            case 'stop':
                this.stop(this.view.selected);
                break;
            case 'wipe':
                await this.batch.buildDir.clean();
                this.reset();
                break;
            case 'connect':
                await this.connect('shachari@lamport');
                break;
            case 'disconnect':
                this.disconnect();
                break;
        }
    }

    _actionKey(action: ActionSpecifier) {
        return this.view.actionKey(action);
    }

    _createTabFor(actionKey: string) {
        var t = this._createTab();
        t.terminal.open(this.view.getTerminal(actionKey));
        return t;
    }
    _createTab(): Tab {
        return {terminal: new Terminal({
            cols: 80,
            rendererType: 'dom',
            allowTransparency: true,
            convertEol: true,
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

    Object.assign(window, { app });
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
    app.batch.loadScripts(new Scripts('data/urchin.json'));
}


document.addEventListener('DOMContentLoaded', main);
