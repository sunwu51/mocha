// 这是一个read-evaluate-print-loop小程序，用来测试整个解释器，用node来运行
import { lex } from "../lexer/lexer.js";
import { Parser } from "../parser/parser.js";
import { evalStatements } from "./eval.js";
import { Context } from "./model.js";
import { MochaError } from "../common/error.js";
import readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const ctx = new Context();
async function play() {
    // 单行输入
    rl.question('>> ', async (answer) => {
        try {
            var statements = new Parser(lex(answer)).parse();
            var res = await evalStatements(statements, ctx);
            console.log(res.toString());
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

play();