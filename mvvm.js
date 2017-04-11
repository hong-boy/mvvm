var MVVM = (function () {
    'use strict';
    // 双向绑定（VUE版）
    var Observer = (function () {
        var arrayProto = Array.prototype,
            arrayFakeProto = Object.create(arrayProto),
            hasProto = '__proto__' in {}; // IE不支持__proto__
        mutateArray();
        // 观察者
        // data对象可能会是一个数组，需要对该数组本身的突变（splice、push、pop、sort等）进行监听
        function Observer(data) {
            this.data = data;
            this.deposit = new Deposit(); // TODO - 思考此处的deposit与defineReactive方法中的deposit的区别？？
            // 给当前Observer实例的data对象绑定一个'__ob__'属性，用于指向当前Observer实例
            def(data, '__ob__', this);
            if (Array.isArray(data)) {
                // 若data为数组，则需要将data.__proto__指向arrayMethods;
                // 若浏览器不支持__proto__，则将arrayFakeProto的方法全部拷贝到data对象上
                var fn = hasProto ? function (target, src) {
                    target.__proto__ = src;
                } : function (target, src, keys) {
                    keys.forEach(function (key) {
                        def(target, key, src[key]);
                    });
                };
                fn(data, arrayFakeProto, Object.getOwnPropertyNames(arrayFakeProto));
                this.observeArray(data);
            } else {
                this.walk(data);
            }
        }

        Observer.prototype = {
            observeArray: function (data) {
                data.forEach(function (item) {
                    observe(item);
                });
            },
            walk: function (data) {
                Object.keys(data).forEach(function (key) {
                    this.defineReactive(this.data, key, data[key]);
                }.bind(this));
            },
            defineReactive: function (data, key, val) {
                var dep = new Deposit();
                var childs = observe(val); // 递归子属性
                Object.defineProperty(data, key, {
                    configurable: false,
                    enumerable: true,
                    get: function () {
                        if (Deposit.target) {
                            // 在getter方法中注册订阅者
                            dep.depend();
                            if (childs) {
                                childs.deposit.depend();
                            }
                        }
                        return val;
                    },
                    set: function (newVal) {
                        if (val === newVal) {
                            return;
                        }
                        val = newVal;
                        // 若newVal是一个对象，则递归子属性
                        childs = observe(newVal);
                        // 通知订阅者
                        dep.notify();
                    }
                });
            }
        };
        // 订阅器
        var uid = 0;

        function Deposit() {
            this.id = uid++;
            // 订阅者
            this.subscribers = [];
        }

        Deposit.prototype = {
            addSub: function (sub) {
                this.subscribers.push(sub);
            },
            depend: function () {
                // Deposit.target指代Watcher实例
                // 将Watcher和Deposit建立联系
                Deposit.target && Deposit.target.addDep(this);
            },
            notify: function () {
                this.subscribers.forEach(function (sub) {
                    sub.update();
                });
            }
        };
        Deposit.target = null; // 指代当前Watcher实例

        // 观察（动作）
        function observe(data) {
            if (!data || typeof data !== 'object') {
                return;
            }
            var ob;
            if (data.hasOwnProperty('__ob__') && data.__ob__ instanceof Observer) {
                ob = data.__ob__;
            }
            return ob || new Observer(data);
        }

        // 属性代理
        function def(obj, key, val) {
            Object.defineProperty(obj, key, {
                enumerable: false, // 隐藏属性（不可被for...in遍历）
                writable: true,
                configurable: true,
                value: val
            })
        }

        // 劫持数组 - 修改数组的方法
        // 这里只对数组本身进行监听，并不对新增的元素进行监听；
        // 例如：[{name:'aa'}].push(12) --> 触发dep.notify()
        // [{name:'aa'}, 12][0].name = 'cc' --> 不触发dep.notify()
        function mutateArray() {
            var list = ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'];
            list.forEach(function (method) {
                var originalMethod = arrayProto[method];
                def(arrayFakeProto, method, function () {
                    var result,
                        args = Array.prototype.slice.call(arguments, 0);
                    // this此时指代当前数组（即：Observer.data）
                    result = originalMethod.apply(this, args); // TODO - 此处是否可以不传this
                    this['__ob__'].deposit.notify();
                    return result;
                });
            });
        }

        return {
            observe: observe,
            Deposit: Deposit
        };
    })();
    var Compiler = (function () {
        var REG_TEXT = /\{\{\{(.*)\}\}\}/;

        function Compile(el, vm) {
            this.$vm = vm;
            this.$el = this.isElementNode(el) ? el : document.querySelector(el);
            if (this.$el) {
                this.$fragment = this.node2Fragment(this.$el);
                this.init();
                this.$el.appendChild(this.$fragment);
            }
        }

        Compile.prototype = {
            init: function () {
                this.compileElement(this.$fragment);
            },
            node2Fragment: function (el) {
                var child,
                    fragment = document.createDocumentFragment();
                while (child = el.firstChild) {
                    fragment.appendChild(child);
                }
                return fragment;
            },
            compileElement: function (el) {
                var thiz = this,
                    _slice = Array.prototype.slice,
                    childNodes = el.childNodes;
                _slice.call(childNodes).forEach(function (node) {
                    if (thiz.isElementNode(node)) {
                        thiz.compile(node);
                    } else if (thiz.isTextNode(node) && REG_TEXT.test(node.textContent)) {
                        thiz.compileText(node, RegExp.$1);
                    }
                    // 递归
                    if (node.childNodes && node.childNodes.length) {
                        thiz.compileElement(node);
                    }
                });
            },
            compile: function (node) {
                var thiz = this,
                    _slice = Array.prototype.slice,
                    nodeAttrs = node.attributes;
                _slice.call(nodeAttrs).forEach(function (attr) {
                    var attrName = attr.name;
                    if (thiz.isDirective(attrName)) {
                        var exp = attr.value,
                            dir = attrName.substring(2);
                        if (thiz.isEventDirective(dir)) {
                            compileUtil.eventHandler(node, thiz.$vm, exp, dir);
                        } else if(thiz.isVForDirective(dir)){
                            compileUtil.vfor(node, thiz.$vm, exp);
                        } else{
                            compileUtil[dir] && compileUtil[dir](node, thiz.$vm, exp);
                        }
                        node.removeAttribute(attrName);
                    }
                });
            },
            compileText: function (node, exp) {
                compileUtil.text(node, this.$vm, exp);
            },
            isElementNode: function (node) {
                return node.nodeType === Node.ELEMENT_NODE;
            },
            isTextNode: function (node) {
                return node.nodeType === Node.TEXT_NODE;
            },
            isDirective: function (attr) {
                return attr.indexOf('v-') === 0;
            },
            isEventDirective: function (attr) {
                return attr.indexOf('on') === 0;
            },
            isVForDirective: function (attr) {
                return attr.indexOf('for') === 0;
            }
        };

        var compileUtil = {
            eventHandler: function (node, vm, exp, dir) {
                var eventType = dir.split(':')[1],
                    fn = vm.$options.methods && vm.$options.methods[exp];
                if (eventType && fn) {
                    node.addEventListener(eventType, fn.bind(vm), false);
                }
            },
            bind: function (node, vm, exp, dir) {
                var updaterFn = updater[dir + 'Updater'];
                updaterFn && updaterFn(node, this._getVMVal(vm, exp));
                // 实例化订阅者，此操作会在对应的属性消息订阅器中添加了该订阅者watcher
                new Watcher(vm, exp, function (value, oldValue) {
                    updaterFn && updaterFn(node, value, oldValue);
                });
            },
            text: function (node, vm, exp) {
                this.bind(node, vm, exp, 'text');
            },
            html: function (node, vm, exp) {
                this.bind(node, vm, exp, 'html');
            },
            class: function (node, vm, exp) {
                this.bind(node, vm, exp, 'class');
            },
            model: function (node, vm, exp) {
                this.bind(node, vm, exp, 'model');
                var thiz = this,
                    val = thiz._getVMVal(vm, exp);
                thiz._dispatchEvent(vm, node, exp, val);
            },
            vfor: function (node, vm, exp) {
                node.removeAttribute('v-for');
                var forcodeRE = /(.*?)\s+(?:in)\s+(.*)/, // v-for="aaa in list"
                    localcodeRE = /\{-(.*)\}/,// {-aaa.ccc}
                    propcodeRE = /\s+:(.+)="(.+)"\s*/,// :value="aaa.bbb"
                    inMatches = exp.match(forcodeRE),
                    outerHTML = node.outerHTML,
                    parentNode = node.parentNode,
                    alias = inMatches[1],
                    prop = inMatches[2];
                outerHTML = outerHTML.replace(localcodeRE, function(match, code){
                    return "'+(" + code + ")+'";
                }).replace(propcodeRE, function(match, prop, code){
                    return " " + prop+"='+("+ code + ")+' ";
                });
                // 构造function
                var fnBody = [];
                fnBody.push('var temp = [];');
                fnBody.push('' + (prop) + '.forEach(function('+(alias)+'){');// forEach - START
                fnBody.push('temp.push(\''+(outerHTML)+'\');');
                fnBody.push('});');// forEach - END
                fnBody.push('return temp.join("");');
                var fn = new Function(prop, fnBody.join('\n'));
                //var innterHTML = fn(vm[prop]);
                //parentNode.innerHTML = innterHTML;
                node.remove();
                var updaterFn = updater['vforUpdater'];
                updaterFn && updaterFn(parentNode, fn, this._getVMVal(vm, prop));
                new Watcher(vm, prop, function(newValue, oldValue){
                    updaterFn && updaterFn(parentNode, fn, newValue, oldValue);
                });
            },
            _dispatchEvent: function (vm, node, exp, val) {
                var thiz = this,
                    nodeTag = node.tagName.toUpperCase(),
                    nodeType = node.type;
                if (thiz._isFormElement(node)) {
                    switch (nodeTag) {
                        case 'SELECT':
                        {
                            thiz._processModel4Select(vm, node, exp, val);
                            break;
                        }
                        case 'TEXTAREA':
                        {
                            thiz._processModel4Defaul(vm, node, exp, val);
                            break;
                        }
                        case 'INPUT':
                        {
                            if (nodeType === 'text' || nodeType === 'password') {
                                thiz._processModel4Defaul(vm, node, exp, val);
                            } else if (nodeType === 'checkbox') {
                                thiz._processModel4Checkbox(vm, node, exp, val);
                            } else if (nodeType === 'radio') {
                                thiz._processModel4Radio(vm, node, exp, val);
                            }
                            break;
                        }
                    }
                }
            },
            _processModel4Defaul: function (vm, node, exp, val) {
                var thiz = this;
                // BUG-FIX: 无法输入中文
                node.addEventListener('compositionstart', function (e) {
                    e.target.composing = true;
                });
                node.addEventListener('compositionend', function (e) {
                    e.target.composing = false;
                    var event = document.createEvent('HTMLEvents');
                    event.initEvent('input', true, true);
                    e.target.dispatchEvent(event);
                });
                node.addEventListener('input', function (e) {
                    if (!e.target.composing) {
                        var newValue = e.target.value;
                        if (val === newValue) {
                            return;
                        }
                        thiz._setVMVal(vm, exp, newValue);
                        val = newValue;
                    }
                });
            },
            _processModel4Select: function (vm, node, exp, val) {
                // 目前仅仅支持单选下拉 - TODO
                var thiz = this;
                node.addEventListener('change', function (e) {
                    var newValue = e.target.value;
                    thiz._setVMVal(vm, exp, newValue);
                    val = newValue;
                });
            },
            _processModel4Radio: function (vm, node, exp, val) {
                var thiz = this;
                !node.name && (node.name = exp); // 若没有手动为radio设置name属性，则设置一个默认name
                node.addEventListener('change', function (e) {
                    var newValue = e.target.value;
                    thiz._setVMVal(vm, exp, newValue);
                    val = newValue;
                });
            },
            _processModel4Checkbox: function (vm, node, exp, val) {
                if (!Array.isArray(val)) {
                    // 若传入的val不为数组类型时，则转换
                    val = !!val ? [].concat(val) : [];
                    this._setVMVal(vm, exp, val);
                }
                node.addEventListener('change', function (e) {
                    var el = e.target,
                        newValue = e.target.value,
                        index = val.indexOf(newValue),
                        isExist = index !== -1;
                    if (el.checked) {
                        !isExist && val.push(newValue);
                    } else {
                        isExist && val.splice(index, 1);
                    }
                });
            },
            _isFormElement: function (node) {
                var list = ['INPUT', 'SELECT', 'TEXTAREA'],
                    nodeTag = node.tagName.toUpperCase();
                return list.indexOf(nodeTag) !== -1;
            },
            _getVMVal: function (vm, exp) {
                var val = vm._data; // 先获取数据对象
                exp = exp.split('.'); // such as: "aa.bb.cc.name"
                exp.forEach(function (k) {
                    val = val[k];
                });
                return val;
            },
            _setVMVal: function (vm, exp, value) {
                var len = 0,
                    val = vm._data;
                exp = exp.split('.'); // such as: "aa.bb.cc.name"
                len = exp.length;
                exp.forEach(function (k, i) {
                    if (i < len - 1) {
                        val = val[k];
                    } else {
                        val[k] = value; // such as: "aa.bb.cc[name]=value"
                    }
                });
            }
        };

        var updater = {
            textUpdater: function (node, value) {
                node.textContent = (typeof value === 'undefined' ? '' : value);
            },
            htmlUpdater: function (node, value) {
                node.innerHTML = (typeof value === 'undefined' ? '' : value);
            },
            modelUpdater: function (node, value) {
                switch (node.type) {
                    case 'checkbox':
                    {
                        node.checked = (value.indexOf(node.value) !== -1);
                        break;
                    }
                    case 'radio':
                    {
                        node.checked = (value === node.value);
                        break;
                    }
                    default:
                    {
                        node.value = (typeof value === 'undefined' ? '' : value);
                        break;
                    }
                }
            },
            vforUpdater: function (parentNode, fn, value, oldValue) {
                parentNode.innerHTML = fn(value);
            },
            classUpdater: function (node, value, oldValue) {
                var className = node.className;
                className.replace(oldValue, '').replace(/\s$/, '');
                var space = className && String(value) ? ' ' : '';
                node.className = [className, space, value].join('');
            }
        };

        return Compile;
    })();
    var Watcher = (function () {
        function Watcher(vm, exp, cb) {
            this.vm = vm;
            this.exp = exp;
            this.cb = cb;
            this.depositIds = {};// 存储已观察的依赖
            this.value = this.get(); // 存储为oldValue
        }

        Watcher.prototype = {
            update: function () {
                this.run();
            },
            get: function () {
                Observer.Deposit.target = this;
                //var value = this.vm[exp]; // 此写法不支持"aa.bb.cc.name"
                var value = this.getVMVal();
                Observer.Deposit.target = null;
                return value;
            },
            run: function () {
                var oldValue = this.value,
                    currValue = this.get();
                if (Array.isArray(currValue)) {
                    // 当currValue为数组类型，总是更新
                    this.value = currValue;
                    this.cb.call(this.vm, currValue, oldValue); // 执行Compile中绑定的回调，更新视图
                } else if (oldValue !== currValue) {
                    this.value = currValue;
                    this.cb.call(this.vm, currValue, oldValue); // 执行Compile中绑定的回调，更新视图
                }
            },
            getVMVal: function () {
                var val = this.vm._data,
                    exp = this.exp.split('.');
                exp.forEach(function (k) {
                    val = val[k];
                });
                return val;
            },
            addDep: function (dep) {
                // run() --> 触发属性的getter方法，会执行dep.depend() --> 继而执行此方法
                if (!(this.depositIds.hasOwnProperty(dep.id))) {
                    dep.addSub(this);// TODO 关键点 - 逻辑有点绕
                    this.depositIds[dep.id] = dep;
                }
            }
        };
        return Watcher;
    })();
    var MVVM = (function (observe, Compiler) {
        function MVVM(options) {
            this.$options = options;
            var data = this._data = this.$options.data;
            // 属性代理，实现 vm.xxx -> vm._data.xxx
            Object.keys(data).forEach(function (key) {
                // 传入key，以便知道要代理哪一些属性
                this._proxy(key);
            }.bind(this));
            // 注册观察者
            observe(data);
            this.$compile = new Compiler(this.$options.el || document.body, this);
        }

        MVVM.prototype = {
            _proxy: function (key) {
                var thiz = this;
                Object.defineProperty(thiz, key, {
                    configurable: false,
                    enumerable: true,
                    get: function () {
                        return thiz._data[key];
                    },
                    set: function (newValue) {
                        thiz._data[key] = newValue;
                    }
                });
            }
        };
        return MVVM;
    })(Observer.observe, Compiler);
    return MVVM;
})();