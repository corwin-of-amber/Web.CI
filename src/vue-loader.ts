
import fs from 'fs';

//import { parse } from '@vue/compiler-sfc';
const { parse, compileTemplate, compileScript, compileStyle } = (0||require)('@vue/compiler-sfc') as typeof import('@vue/compiler-sfc');



function main() {
    var filename = 'src/components/app.vue',
        text = fs.readFileSync(filename, 'utf-8');

    var id = 'filename', scopeId = `data-v-${id}`,
        parsed = parse(text, {sourceMap: true, filename});
    console.log(parsed.descriptor);

    var template = compileTemplate({id, filename,  scoped: true,
            source: parsed.descriptor.template.content,
            compilerOptions: {scopeId}
        }),
        script = compileScript(parsed.descriptor, {id}),
        style = parsed.descriptor.styles.map(s =>
            compileStyle({id, filename,
                source: s.content, scoped: s.scoped}));
    console.log(template.code);
    console.log(script.content);
    console.log(style.map(s => s.code).join('\n'));

    fs.writeFileSync('src/components/app.css',
        style.map(s => s.code).join('\n'));
    fs.writeFileSync('src/components/app.ts',
        `import './app.css';\nconst __scopeId = ${JSON.stringify(scopeId)}\n` +
        `${template.code}\n${script.content}`)
}


main();