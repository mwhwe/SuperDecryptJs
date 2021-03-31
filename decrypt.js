var fs = require('fs');


class SuperDecryptJs {

  constructor(filename) {
    this.filename = filename;
    this.data = this.read(filename);

    this.sourceJs = this.data.replace(/\/\*(.|[\r\n])*?\*\//, '');
  }

  read(filename) {
    return fs.readFileSync(filename).toString()
  }

  write(filename, data) {
    return fs.writeFileSync(filename, data)
  }

  jsjiami() {
    let startTime = Date.now(),
      errorData = [],
      encryptJsIndex, encryptJsSplit;

    [encryptJsIndex, encryptJsSplit] = this._findEncryptJsIndex()

    let encryptJs = this.sourceJs.substring(encryptJsIndex, this.sourceJs.length).trim(),
      encryptFuncJsIndex = encryptJs.indexOf(' }; (') + 3,
      encryptFuncJs = encryptJs.substring(0, encryptFuncJsIndex).trim(),
      encryptDataJs = encryptJs.substring(encryptFuncJsIndex).trim(),
      encryptArrJs = this.sourceJs.substring(0, encryptJsIndex),
      encryptFuncName = this._match(/var\s+([_]+0x[a-z0-9]+)\s+=/, encryptFuncJs),
      encryptFunc = this._strObjJs(encryptFuncName, encryptArrJs, encryptFuncJs);

    // 全局替换
    encryptDataJs = this._decryptStr(encryptDataJs, encryptFuncName, encryptFunc);

    // 局部替换
    let encryptPartArrMap = {};
    encryptDataJs.replace(/var\s*([_]+0x[a-z0-9]+)\s*=\s*(\{.*?\};)/g, (str, encryptPartArrName, encryptPartArrJs) => {
      let encryptPartArr;

      try {
        encryptPartArr = this._strObjJs(encryptPartArrName, encryptPartArrJs);
      } catch (error) {
        // 单字符匹配
        let encryptPartArrCharJs = this._matchObjJsStr(encryptDataJs, `var ${encryptPartArrName}`);
        try {
          encryptPartArr = this._strObjJs(encryptPartArrName, encryptPartArrCharJs);
        } catch (e) {
          errorData.push(JSON.stringify({
            'type': 'part replace',
            'name': encryptPartArrName,
            'js': encryptPartArrCharJs,
            'error': e.message
          }));

          return;
        }

        encryptPartArrJs = encryptPartArrCharJs
      }

      encryptPartArrMap[encryptPartArrName] = encryptPartArr;

      encryptDataJs = encryptDataJs.replace(encryptPartArrJs, '');

      encryptDataJs = this._decryptStr(encryptDataJs, encryptPartArrName, encryptPartArr);
    });

    // 转对象调用
    encryptDataJs = encryptDataJs.replace(/([a-z0-9\-_A-Z)\]]+)\s?\[["']([^"']+)["']\]/g, '$1.$2');
    // 字符转义
    encryptDataJs = encryptDataJs.replace('\\x20', ' ');

    this.write('qcc_decrypt.js', encryptDataJs);

    if (errorData) {
      this.write(`decrypt_error-${startTime}.txt`, errorData.join("\n"));
    }

    console.log("decrypt completed. use time: %fs", (Date.now() - startTime) / 1000);

    return encryptDataJs;
  }

  _findEncryptJsIndex() {
    let index = -1,
      splitFlagMap = ['));var', ')); var', '));\nvar'];

    for (const split of splitFlagMap) {
      if (this.sourceJs.indexOf(split) != -1) {
        index = this.sourceJs.indexOf(split);

        return [index + 3, split];
      }
    }

    throw 'Cannot Found function.'
  }

  // 正则匹配
  _match(pattern, string) {
    const p = new RegExp(pattern);

    const result = p.exec(string)

    return result ? result[1] : null;
  }

  // 匹配js
  _matchObjJsStr(encryptDataJs, start) {

    let encryptPartArr = [],
      charPair = {},
      splitObjMap = {
        'brace': ['{', '}'],
        // 'bracket': ['[', ']'],
      },
      charPairCale = (char, isAdd = true) => {
        if (charPair[char] == undefined) {
          charPair[char] = 0;
        }

        if (isAdd) {
          charPair[char] += 1;
        } else {
          charPair[char] -= 1;
        }
      };
    for (let i = encryptDataJs.indexOf(start); i < encryptDataJs.length; i++) {
      let itemChar = encryptDataJs[i];
      if (charPair['brace'] === 0) {
        break;
      }
      for (let key in splitObjMap) {
        if (splitObjMap[key].indexOf(itemChar) >= 0) {
          charPairCale(key, itemChar === splitObjMap[key][0]);
        }
      }

      encryptPartArr.push(itemChar);
    }

    return encryptPartArr.join('');
  }

  // 字符串转对象
  _strObjJs(name, ...jsStrs) {
    return eval(`(function(){${jsStrs.join('; ')}; return ${name};})()`);
  }

  _decryptStr(encryptJs, encryptFuncNmae, obj) {
    let pattern,
      isFunction = obj instanceof Function;
    if (isFunction) {
      pattern = `${encryptFuncNmae}\\('(.[^']{1,10})',\\s*'(.[^']{1,10})'\\)`;
    } else {
      pattern = `${encryptFuncNmae}\\['(.[^']{1,20})'\\]`;
    }

    return encryptJs.replace(new RegExp(pattern, 'g'), (str, id, key) => {
      let value = isFunction ? obj(id, key) : obj[id];

      // 函数
      if (/function.*?\{.*?\}/.test(value)) {
        return value;
      }

      // 数字金额
      if (/((^[1-9]\d*)|^0)(\.\d{1,2}){0,1}$/.test(value)) {
        return eval(`(function(){return ${value}})()`);
      }

      // 引号转义
      if (value.indexOf("'") !== -1 && value.indexOf('"') !== -1) {
        value = value.replace(/'/g, "\\'");
      }

      // 字符转义
      try {
        value = eval(`(function(){return '${value}'})()`)
      } catch (e) {}

      if (value.length < 20 && value.indexOf("'") === -1 && value.indexOf('"') === -1) {
        return "'" + value + "'";
      }

      // 超长字符使用模板字符串
      return '`' + value + '`';
    });
  }

  _replace(pattern, str, cb) {
    return str.replace(pattern, cb);
  }
}

// demo
const argvs = process.argv.splice(2)

filename = argvs[0] || 'source.txt';

const d = new SuperDecryptJs(filename)

d.jsjiami()
