# 说明
本项目用最简单的代码实现了一个类js解释器，旨在以最轻松的方式，来学习如何实现一门语言，当前项目为`js`版本，可以在`node` `bun`等后端js运行时直接运行无三方库依赖，也可以在浏览器中直接运行（不支持`File`），该项目同时还有`rust`版本[repo](https://github.com/sunwu51/mocha-rs)和`java`版本的[repo](https://github.com/sunwu51/mocha-java)（java版本代码逻辑有较大不同，采用了`antlr`工具辅助实现）。

当前已经实现的特性有：赋值、判断、循环、函数、闭包、面向对象（仅继承与多态）、异常抛出、try-catch等。

赋值、判断、循环：

![img](https://i.imgur.com/cu4a8Hy.gif)

函数、闭包、异常、try-catch：

![img](https://i.imgur.com/95o7Hei.gif)

面向对象：

![img](https://i.imgur.com/eR1Lz2f.gif)

表达式优先级：

![img](https://i.imgur.com/MSfxnAi.gif)

字符串、数组：

![img](https://i.imgur.com/dPqBR00.gif)

扩展功能`Math` `Time` `Json` `File` `Http`：

![img](https://i.imgur.com/BcaxrgM.gif)

# 启动
如果有`node`环境可以直接用`node`启动，如果没有也可以从`release`中下载打包好的二进制可执行文件，来执行文件。
```bash
$ node main.js test.mocha
```
其中`test.mocha`可以换成其他文件，当前语言的语法和js类似，可以参考`test.mocha`中的用法。
# 注意
该项目只用于教学，并没有做详细的边界情况的测试，同时解释性能和同步http库有严重的性能问题，请勿用于生产环境。

# mocha
摩卡是我家的大肥猫！！

![mocha](./mocha.jpg)
