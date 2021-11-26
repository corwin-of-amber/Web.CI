import commander from 'commander';

import { Batch, BuildDirectory } from './batch';


function main() {
    var o = commander.program
        .arguments('<file> [actions...]')
        .option('--dir <dir>')
        .parse(process.argv);

    var opts = o.opts();

    var batch = new Batch;
    if (opts.dir)
        batch.buildDir = new BuildDirectory(opts.dir);

    batch.loadScripts(o.args[0]);
    console.log(batch.scripts.defs);

    batch.on('script:start', ({scriptName}) => {
        console.log(`\n⦿ '${scriptName}' started`); 
    });

    batch.on('script:end', ({scriptName, status, err}) => {
        if (status === 'ok')
            console.log(`\n✓ '${scriptName}' completed`); 
        else {
            if (err) console.error(err);
            console.log(`\n✗ '${scriptName}' failed`); 
        }
    })

    runActions(batch, o.args.slice(1));
}

async function runActions(batch: Batch, actions: string[]) {
    for (let action of actions) {
        var { shell, job } = batch.startLocalJob(action);
        shell.pipe(<any>process.stdout);
        await job;
    }
}

main();