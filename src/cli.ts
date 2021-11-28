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

    runActions(batch, parseActions(batch.scripts, o.args.slice(1)));
}

function parseActions(scripts: Scripts, spec: string[]) {
    if (spec.length === 0) return scripts.names;
    else return [].concat(...spec.map(nm => {
        var dots = nm.split(/\.\.+/);
        if (dots.length == 1) return [nm];
        else if (dots.length == 2) {
            function find(name: string) {
                var idx = names.indexOf(name);
                if (idx < 0) throw new Error(`action not found: '${name}'`);
                return idx;
            }
            var names = scripts.names,
                from = dots[0] ? find(dots[0]) : 0,
                to = dots[1] ? find(dots[1]) : Infinity;
            return names.slice(from, to + 1);
        }
        if (dots.length > 2) throw new Error(`too many dots: '${nm}'`);
    }));
}

async function runActions(batch: Batch, actions: string[]) {
    console.log('Running:', actions);

    for (let action of actions) {
        var {shell, job} = batch.startLocalJob(action);
        shell.pipe(<any>process.stdout);
        var {status} = await job;
        if (status !== 'ok') break;
    }
}

function formatDuration(millis: number) {
    return `${Math.round(millis / 1000)} sec`;
}


const REPORT_TIME_IF_GT = 100 * 1000; /* ms */


main();