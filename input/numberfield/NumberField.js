import React, {Component, PropTypes} from 'react';

import cls from './numberfield.css';
import format from '../../../lib/number/format';
import trim from '../../../lib/string/trim';
import { keys, isNumberKey, isPercentKey, containsKey } from './keys';

/**
 * 数字输入框组件 （兼容IE低版本）
 * 支持正负数输入、最大最小值、小数点位数及步长，支持数据格式化显示
 */
class NumberField extends Component {
    constructor(props) {
        super(props);
        this.state = {
            status: NumberField.STATUS_INACTIVE,
            value: props.value,
            text: format(props.value, props.decimal, props.decimalPoint, props.thousandSep),

            readOnly: props.readOnly
        };

        /** 光标的位置 */
        this.cursorPos = 0;
        /** 
         * 定时器ID，用于按住上下箭头是数值连续自动增减
         */
        this.intervalID = 0;

        this.onBlur = this.onBlur.bind(this);
        this.onFocus = this.onFocus.bind(this);
        this.onChange = this.onChange.bind(this);
        this.onKeydown = this.onKeydown.bind(this);
        this.onKeyup = this.onKeyup.bind(this);
    }

    render() {
        let { text, value, status } = this.state,
            val = status == NumberField.STATUS_INACTIVE ? text : (value ? value : 0),
            { readOnly, className, textAlign } = this.props,
            style = readOnly ? { disabled: 'disabled' } : {};
        return (
            <div className={`number-field ${className}`}>
                <input
                    ref={(ref) => this.input = ref}
                    type="text"
                    value={val}
                    {...style}

                    style={{ textAlign: textAlign }}

                    onKeyDown={this.onKeydown }
                    onKeyUp={this.onKeyup }

                    onFocus={this.onFocus }
                    onBlur={this.onBlur }
                    onChange={this.onChange }/>
            </div>
        );
    }

    componentWillReceiveProps(nextProps) {
        let { value } = this.state,
            nextVal = nextProps.value,
            newVal = (nextVal !== undefined && nextVal != value) ? nextVal : value;
        this.setValue(newVal);
    }

    setValue(val = 0) {
        if (!(/^[-+]?\d*\.?\d*[%]?$/.test(val))) {
            throw new Error(`the parameter val(${val}) is not correct. '+.12', '-123', '12%', .etc`);
        }
        let { min, max, decimal, decimalPoint, thousandSep } = this.props;
        val = val + '';
        val = val.indexOf('%') > 0 ? (parseFloat(val, 10) / 100) : parseFloat(val, 10);
        if (val >= min && val <= max) {
            this.setState({
                value: val,
                text: format(val, decimal, decimalPoint, thousandSep)
            });
        } else {
            throw new RangeError(`the parameter ${val} is out of boundary [${min}, ${max}]`);
        }
    }

    getValue() {
        let val = this.state.value + '',
            { decimal, decimalPoint, thousandSep } = this.props;
        if (val.indexOf('%') >= 0) {
            return format(parseFloat(val, 10) / 100, decimal, decimalPoint, thousandSep);
        }
        return val;
    }

    onFocus(event) {
        this.setState({
            status: NumberField.STATUS_ACTIVE
        });
        this.props.onFocus(this.state.value);
    }

    onBlur(event) {
        let val = event.target.value,
            has_percent = val.indexOf('%') > 0,
            { decimal, decimalPoint, thousandSep } = this.props;
        this.setState({
            status: NumberField.STATUS_INACTIVE,
            text: format(val, decimal, decimalPoint, thousandSep) + (has_percent ? '%' : '')
        });
        this.props.onBlur(val);
    }

    onChange(event) {
        let val = event.target.value,
            has_percent = val.indexOf('%') > 0,
            { decimal, decimalPoint, thousandSep } = this.props;
        this.setState({
            value: !val ? 0 : val
        });
        if (has_percent) {
            val = format(parseFloat(val, 10) / 100, decimal, decimalPoint, '');
        }
        this.props.onChange(val);
    }

    /**
     * 键盘按键处理
     */
    onKeydown(event) {
        let keyCode = event.keyCode;
        // 禁止输入预定义之外的所有按键
        if (!containsKey(keyCode)) {
            return this.preventDefault(event);
        }
        let cursorPos = this.getCursorPosition(),
            val = trim(event.target.value),
            decimal = this.props.decimal;
        // 是否为 + 或 -
        if (keyCode === keys.KEY_PLUS || keyCode === keys.KEY_MINUS) {
            // + - 必须在数值的最开始; 如果最小值为非负数，则禁止输入 -
            if (cursorPos !== 0 || (this.props.min >= 0 && keyCode === 0xbd)) {
                return this.preventDefault(event);
            }
        } else if (isPercentKey(event, keyCode) && cursorPos < val.length) { // 是否为 %, 必须位于末尾
            return this.preventDefault(event);
        } else if (keyCode === keys.KEY_PERIOD) { // 是否为点号
            // 检查是否允许输入小数点
            if (decimal === 0 // 检查是否允许输入小数点
                || ((val.indexOf('+') >= 0 || val.indexOf('-') >= 0) && cursorPos === 0) // 小数点号不能位于+-号前面
                || (val.indexOf('%') >= 0 && cursorPos == val.length) // 也不能位于%后面
                || (val.indexOf('.') >= 0)) { // 如果已经存在点号，禁止再次输入
                return this.preventDefault(event);
            }
            /**
             * 统计当前小数点位数，如果小数点位数超过允许范围值，则禁止输入
             */
            let char_code = 0, decs = 0;
            for (let i = cursorPos; i < val.length; i++) {
                char_code = val.charCodeAt(i);
                if (char_code < keys.KEY_0 || char_code > keys.KEY_9) {
                    break;
                }
                decs++;
            }
            if (decs > decimal) {
                return this.preventDefault(event);
            }
        } else if (keyCode === keys.KEY_ARROW_UP || keyCode === keys.KEY_ARROW_DOWN) { // 如果是上下箭头
            if (!this.intervalID) {
                // 定时器做数值的自动增减
                this.intervalID = setInterval(() => {
                    this.onInterval(keyCode === keys.KEY_ARROW_UP ? NumberField.OPT_INC : NumberField.OPT_DEC);
                }, 50);
            }
            return this.preventDefault(event);
        } else if (isNumberKey(keyCode)) { // 如果是数字键
            return this.processNumberKey(event, keyCode, cursorPos,val);
        }
        return true;
    }

    onKeyup() {
        this.killInterval();
    }

    onInterval(incOrdec) {
        let { value } = this.state,
            { step, min, max } = this.props;
        value += incOrdec * step;
        if (value >= min && value <= max) {
            this.setState({ value: value }, () => {
                this.setCursorPosition((value + '').length);
            });
        }
        if (value <= min || value >= max) {
            this.killInterval();
        }
    }

    killInterval() {
        this.intervalID && clearInterval(this.intervalID);
        this.intervalID = 0;
    }

    getCursorPosition() {
        let input = this.input;
        if ('selectionStart' in input) {
            return input.selectionStart;
        } else {
            input.focus();
            let sel = document.selection.createRange(),
                selLen = sel.text.length;
            sel.moveStart('character', -input.value.length);
            return sel.text.length - selLen;
        }
    }

    setCursorPosition(pos = 0) {
        let ctrl = this.input;
        if (ctrl.setSelectionRange) {
            ctrl.focus();
            ctrl.setSelectionRange(pos, pos);
        } else if (ctrl.createTextRange) {
            var range = ctrl.createTextRange();
            range.collapse(true);
            range.moveEnd('character', pos);
            range.moveStart('character', pos);
            range.select();
        }
    }

    processNumberKey(event, keyCode, cursorPos, val) {
        let percent_pos = val.indexOf('%');
        // % 后面不能输入任何数字
        if (percent_pos >= 0 && cursorPos > percent_pos) {
            return this.preventDefault(event);
        }
        let dec_pos = val.indexOf('.'), char_code = 0;
        if (dec_pos >= 0 && cursorPos > dec_pos) {
            let decs = 0;
            for (let i = dec_pos + 1; i < val.length; i++) {
                char_code = val.charCodeAt(i);
                if (!(char_code >= 0x30 && char_code <= 0x39)) {
                    break;
                }
                decs++
            }
            // 小数位超过允许的范围
            if (decs >= decimal) {
                return this.preventDefault(event);
            }
        }
        let newVal = [
            val.substring(0, cursorPos),
            String.fromCharCode(keyCode > keys.KEY_9 ? (keyCode - 0x30) : keyCode),
            val.substring(cursorPos)
        ].join('');
        if (newVal.indexOf('%') >= 0) {
            newVal = newVal.substring(0, newVal.indexOf('%'));
            newVal = parseFloat(newVal, 10) / 100;
        } else {
            newVal = parseFloat(newVal, 10);
        }
        // 输入后的数值小于最小值或者大于最大值
        if (newVal < this.props.min || newVal > this.props.max) {
            return this.preventDefault(event);
        }

        this.cursorPos = cursorPos;

        return true;
    }

    preventDefault(event) {
        event.preventDefault();
        return false;
    }

}

NumberField.STATUS_ACTIVE = 1;
NumberField.STATUS_INACTIVE = 2;
NumberField.MAX_VALUE = 9007199254740991;
NumberField.MIN_VALUE = -9007199254740991;
NumberField.OPT_INC = 1;
NumberField.OPT_DEC = -1;

NumberField.propTypes = {
    value: PropTypes.number,
    decimal: PropTypes.number,
    min: PropTypes.number,
    max: PropTypes.number,
    step: PropTypes.number,
    textAlign: PropTypes.string,
    readOnly: PropTypes.bool,
    onBlur: PropTypes.func,
    onFocus: PropTypes.func,
    onChange: PropTypes.func
};

NumberField.defaultProps = {
    value: 0,
    decimal: 0,
    decimalPoint: '.',
    thousandSep: '',
    step: 1,
    min: NumberField.MIN_VALUE,
    max: NumberField.MAX_VALUE,

    className: '',
    textAlign: 'left',
    readOnly: false,

    onFocus: () => { },
    onBlur: () => { },
    onChange: () => { }
};

export default NumberField;
