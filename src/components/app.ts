import './app.css';
const __scopeId = "data-v-filename"
import { renderList as _renderList, Fragment as _Fragment, openBlock as _openBlock, createBlock as _createBlock, toDisplayString as _toDisplayString, createVNode as _createVNode, withScopeId as _withScopeId, pushScopeId as _pushScopeId, popScopeId as _popScopeId } from "vue"
const _withId = /*#__PURE__*/_withScopeId("data-v-filename")

_pushScopeId("data-v-filename")
const _hoisted_1 = { id: "app" }
const _hoisted_2 = /*#__PURE__*/_createVNode("div", { id: "area" }, null, -1 /* HOISTED */)
_popScopeId()

export const render = /*#__PURE__*/_withId((_ctx, _cache) => {
  return (_openBlock(), _createBlock("div", _hoisted_1, [
    _createVNode("ul", null, [
      (_openBlock(true), _createBlock(_Fragment, null, _renderList(_ctx.actions, (action) => {
        return (_openBlock(), _createBlock("li", {
          key: action,
          class: {selected: action == _ctx.selected},
          onClick: $event => (_ctx.selectAction(action, $event))
        }, _toDisplayString(action), 11 /* TEXT, CLASS, PROPS */, ["onClick"]))
      }), 128 /* KEYED_FRAGMENT */))
    ]),
    _hoisted_2
  ]))
})

declare var render: any, __scopeId: string;

export default {
    props: ['actions'],
    data: () => ({selected: undefined}),
    methods: {
        selectAction(action: string, ev: MouseEvent) {
            this.selected = action;
        }
    },
    render,
    __scopeId
}
