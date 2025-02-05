import { NativeFunctionElement,ProtoElement,NumberElement,StringElement, falseElement, trueElement, Element, ArrayElement, nil, Context} from "../eval/model.js";
import { RuntimeError } from "../common/error.js";

var IS_NODE = typeof process !== 'undefined' && process.versions && process.versions.node;

var fs = null;
if (IS_NODE) {
    var init = async function() {
        fs  = (await import('fs')).default;
    };
    await init();
    // console.log("init nodejs libs finished")
}

export const buildIn = new Map();
export const getBuildInCtx = function() {
    var buildInCtx = new Context();
    buildIn.forEach((v, k) => {
        buildInCtx.set(k, v);
    });
    return buildInCtx;
};

// Math库
const math = new ProtoElement('Math');

math.set('random', new NativeFunctionElement(function(max) {
    if (max === undefined) max = 1;
    return new NumberElement(Math.random() * max);
}));

math.set('floor', new NativeFunctionElement(function(num) {
    return new NumberElement(Math.floor(num));
}));

math.set('ceil', new NativeFunctionElement(function(num) {
    return new NumberElement(Math.ceil(num));
}));

math.set('abs', new NativeFunctionElement(function(num) {
    return new NumberElement(Math.abs(num));
}));

buildIn.set("Math", math);

// Time库
const time = new ProtoElement("Time");

time.set('now', new NativeFunctionElement(function() { return new NumberElement(new Date().getTime());}));
time.set('sleep', new NativeFunctionElement(async function(ms) { 
    await new Promise((c) => setTimeout(()=>{c()}, ms));
    return nil;
}));

buildIn.set("Time", time);

const json = new ProtoElement("Json");
json.set("stringify", new NativeFunctionElement(function(obj, opt1, opt2) {
    return new StringElement(JSON.stringify(obj, opt1, opt2));
}));

json.set("parse", new NativeFunctionElement(function(str) {
    return jsObjectToElement(JSON.parse(str))
}));
buildIn.set("Json", json);


// File库
const file = new ProtoElement("File");

file.set("readFile", new NativeFunctionElement(function(filename, charset) {
    try {
        if (fs) {
            if (!charset) charset = 'UTF-8';
            return new StringElement(fs.readFileSync(filename, charset));
        } else {
            throw new RuntimeError("File library is not supported in the browser environment.");
        }
    } catch (e) {
        throw new RuntimeError(e.message)
    }
}));

file.set("writeFile", new NativeFunctionElement(function(filename, content) {
    try {
        if (fs) {
            fs.writeFileSync(filename, content);
        } else {
            throw new RuntimeError("File library is not supported in the browser environment.");
        }
    } catch (e) {
        throw new RuntimeError(e.message);
    }
}));


file.set("appendFile", new NativeFunctionElement(function(filename, content) {
    try {
        if (fs) {
            fs.appendFileSync(filename, content);
        } else {
            throw new RuntimeError("File library is not supported in the browser environment.");
        }
    } catch (e) {
        throw new RuntimeError(e.message);
    }
}));

if (fs) {
    buildIn.set('File', file);
}

// http
const http = new ProtoElement('Http')

http.set("fetch", new NativeFunctionElement(async function(url, options){
    try {
        var status = -1;
        var text = await fetch(url, options).then(res => {
            status = res.status;
            return res.text()
        });
        return jsObjectToElement({body: text, status});
    } catch(e) {
        throw new RuntimeError("http request error " + e.message);
    }
}))


buildIn.set("Http", http);


function jsObjectToElement(obj) {
    if (typeof obj === 'number') {
        return new NumberElement(obj);
    } else if (typeof obj === 'string') {
        return new StringElement(obj);
    } else if (typeof obj === 'boolean') {
        return obj ? trueElement: falseElement;
    } else if (obj === null) {
        return nil;
    } else if (Array.isArray(obj)) {
        return new ArrayElement(obj.map(e => jsObjectToElement(e)));
    } else if (obj === null || obj === undefined) {
        return nil;
    }
    // obj类型
    const keys = Object.keys(obj);
    const res = new Element("nomalMap")
    res.map = new Map();
    keys.forEach(key => res.map.set(key, jsObjectToElement(obj[key])));
    return res;
}


