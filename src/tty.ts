import Vue from 'vue';
import Terminal from 'terminal.js';

import './tty.css';

// @ts-ignore
import appComponent from './components/app.vue';


document.addEventListener('DOMContentLoaded', main);

function main() {
    if (!process.version)
        Object.assign(process, require('process'));

    var app = Vue.createApp(appComponent, {
                  actions: Vue.reactive(['a', 'b'])
              })
              .mount('#app-container');

    var terminal = new Terminal({columns: 80});
    terminal.dom(document.querySelector('#app .area--terminal'));

    //remoteShell(terminal);
    nativeShell(terminal);

    // @ts-ignore
    app.selectAction('a');

    Object.assign(window, {terminal, app});
}

function remoteShell(terminal: Terminal) {
    var w = new WebSocket(`ws://${location.host || 'localhost:3300'}`);

    w.addEventListener('message', ev => {
        console.log(ev);
        terminal.write(ev.data);
    });
    w.addEventListener('open', () => w.send('build'));

    Object.assign(window, {w});
}


async function nativeShell(terminal: Terminal) {
    const { Shell, Scripts } = await import('./shell');

    var shell = new Shell();
    shell.pipe(terminal as WritableStreamDefaultWriter);
    shell.runScript(['ls', 'npm ls']);

    Object.assign(window, {shell});
}
