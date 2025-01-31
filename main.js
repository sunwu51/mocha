import fs from 'fs';
import { lex } from './lexer/lexer.js';
import { Parser } from './parser/parser.js';
import { evalStatements } from './eval/eval.js';
import { Context } from './eval/model.js';
import { MochaError } from './common/error.js';
import { getBuildInCtx } from './sdk/util.js';
import readline from 'readline';

async function evaluate(input, ctx = getBuildInCtx()) {
    var tokens = lex(input);
    // console.log(statements)
    var statements = new Parser(tokens).parse();
    // statements.forEach(statement => console.log(statement.toString()))
    return await evalStatements(statements, ctx, false);
}
// 俩参数第二个参数是文件
if (process.argv.length >= 3) {
    const filename = process.argv[2];
    console.log(">> run file: " + filename)
    const content = fs.readFileSync(filename, 'utf-8');
    evaluate(content)
} else {
    // 一个参数则是repl
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const ctx = getBuildInCtx();
    async function play() {
        // 单行输入
        rl.question('>> ', async (answer) => {
            try {
                var res = await evaluate(answer, ctx);
                console.log(res ? res.toString() : res);
            } catch (e) {
                if (e instanceof MochaError) {
                    console.error(e.toString());
                } else {
                    throw e;
                }
            }
            await play();
        });  
    }

    await play();
}