#!/usr/bin/env node

const fs = require('fs'),
      express = (0||require)('express');

import { Shell, Scripts } from './shell';
      
var app = express();

var expressWs = (0||require)('express-ws')(app);

const DEFAULT_PORT = 3300;

var port = process.argv[2] ? parseInt(process.argv[2]) : DEFAULT_PORT,
    dir = process.argv[3] || '.';

app.use(express.static(dir))
/*
app.get('/', (req, res) => {
  res.send('Hello World!')
})*/

app.ws('/', function(ws, req) {
    ws.on('message', async function(msg) {
        console.log(msg);
        try {
            await action(msg, ws);
        }
        catch (e) { console.error(e); }
        finally { ws.close(); }
    });
    console.log('socket', req.path);//, ws);
});


function action(msg, ws) {
    var scripts = new Scripts('data/just.json');

    var shell = new Shell();
    shell.pipe({
        write(d) { ws.send(d); }
    });
    return shell.runScript(scripts.get(msg));
}

// Get my IP
os = require('os')
ifaces = os.networkInterfaces()

var addresses = [];
for (let name in ifaces) {
    let iface = ifaces[name];
    for (let entry of iface) {
        if (entry.family == 'IPv4' && !entry.internal)
            addresses.push(entry.address);
    }
}


app.listen(port, function () {
    console.log(`Express server listening on http://${addresses[0] || 'localhost'}:${port}`);
});
