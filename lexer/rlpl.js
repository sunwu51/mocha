// 这是一个read-lexical analyze-print-loop小程序，用来测试词法解析器，用node来运行
import { lex } from './lexer.js';
import { MochaError } from '../common/error.js';
import readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function play() {
    // 单行输入
    rl.question('>> ', (answer) => {
        try {
            console.log(lex(answer));
        } catch (e) {
            if (e instanceof MochaError) {
                console.error(e.toString());
            } else {
                throw e;
            }
        }
        play();
    });  
}

play();