import commander from 'commander';

import { Batch, BuildDirectory, Scripts } from './batch';


function main() {
    var o = commander.program
        .arguments('<file> [actions...]')
        .option('--dir <dir>')
        .option('-c,--clean', 'clean directory before running actions')
        .option('-n,--dry-run', 'do not actually run commands; just print them')
        .parse(process.argv);

    var opts = o.opts();

    var batch = new Batch({clean: opts.clean, dry: opts.dryRun});
    if (opts.dir)
        batch.buildDir = new BuildDirectory(opts.dir);

    batch.loadScripts(o.args[0]);
    console.log(batch.scripts.defs);

    batch.on('script:start', ({scriptName}) => {
        console.log(`\n⦿ '${scriptName}' started`); 
    });

    batch.on('script:end', ({scriptName, status, err, totalTime}) => {
        if (status === 'ok')
            console.log(`\n✓ '${scriptName}' completed`); 
        else {
            if (err) console.error(err);
            console.log(`\n✗ '${scriptName}' failed`); 
        }
        if (totalTime > REPORT_TIME_IF_GT) {
            console.log(`   (${formatDuration(totalTime)})`);
        }
    })

    runActions(batch, parseActions(batch, o.args.slice(1)));
}

function parseActions(batch: Batch, spec: string[]) {
    try {
        return batch.parseActions(spec);
    }
    catch (e) {
        console.log("invalid action spec:", e);
        process.exit(1);
    }
}

async function runActions(batch: Batch, actions: string[]) {
    console.log('Running:', actions);

    batch.runActions(actions);
}

function formatDuration(millis: number) {
    return `${Math.round(millis / 1000)} sec`;
}


const REPORT_TIME_IF_GT = 100 * 1000; /* ms */


main();