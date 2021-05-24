import Vue from 'vue';
import Terminal from 'terminal.js';

import './tty.css';

// @ts-ignore
import appComponent from './components/app.vue';
import { App } from './components/app';


function main() {
    if (!process.version)
        Object.assign(process, require('process'));

    var app = Vue.createApp(appComponent, {
                  actions: Vue.reactive([])
              })
              .mount('#app-container') as Vue.ComponentPublicInstance & App;

    var terminal = new Terminal({columns: 80});

    remoteShell(terminal, app);
    //nativeShell(terminal, app);

    Object.assign(window, {terminal, app});
}

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


async function nativeShell(terminal: Terminal, app: App) {
    const { Shell, Scripts } = await import('./shell');

    var shell = new Shell();
    shell.pipe(terminal as WritableStreamDefaultWriter);

    var scripts = new Scripts('data/just.json');
    app.actions.push(...scripts.names);

    await Promise.resolve(); // now app has to update...

    var action = scripts.names[0];
    if (action) {
        app.selectAction(action);
        terminal.dom(app.getTerminal(action));
        shell.runScript(scripts.get(action))
        .catch(() => app.status.set(action, '✗'))
    }

    Object.assign(window, {shell, scripts});

    return {shell, scripts};
}


document.addEventListener('DOMContentLoaded', main);
