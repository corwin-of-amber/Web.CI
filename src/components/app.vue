<template>
    <div id="app">
        <ul>
            <li v-for="action in actions" :key="actionKey(action)"
                :class="{selected: actionKey(action) == actionKey(selected)}"
                @click="selectAction(action, $event)">
                {{actionDisplay(action)}}
                <span class="action--status" v-if="status.has(action)">
                    {{status.get(action)}}
                </span>
            </li>
        </ul>
        <div id="area">
            <div class="area--toolbar" @click="toolbarAction">
                <button name="start">Start</button>
                <button name="stop">Stop</button>
                <button name="wipe">Wipe</button>
                <button name="connect">Connect</button>
                <button name="disconnect">Disconnect</button>
            </div>
            <div v-for="action in actions" :key="actionKey(action)"
                :ref="el => registerTab(el, action)" :data-action="action"
                class="area--tab" :class="{active: actionKey(action) == actionKey(selected)}">
                <div class="area--terminal" v-once></div>
            </div>
        </div>
    </div>
</template>

<style scoped>
#app {
    display: flex;
}
ul {
    width: 7em;
    line-height: 1.3;
    list-style: none;
    padding-inline-start: 0;
}
ul > li {
    padding-left: .3em;
}
ul > li.selected {
    background: blue;
    color: white;
}
div#area {
    background: #ddd;
    flex-grow: 1;
}
div.area--tab {
    display: none;
}
div.area--tab.active {
    display: block;
}
span.action--status {
    float: right;
}
</style>

<script lang="ts">
import { Vue, Component, Prop, toNative } from 'vue-facing-decorator';
import type { ActionSpecifier } from '../batch';

@Component({
    emits: ['select', 'action']
})
class IApp extends Vue {
    @Prop actions: ActionSpecifier[]
    selected: any = undefined
    status = new Map
    tabs = new Map

    actionKey(action: ActionSpecifier) {
        return Array.isArray(action) ? action.join('::') : action;
    }
    actionDisplay(action: ActionSpecifier) {
        return Array.isArray(action) ? action.join(' › ') : action;
    }

    selectAction(action: ActionSpecifier, ev?: MouseEvent) {
        if (this.actionKey(this.selected) != this.actionKey(action)) { // avoid event cycles
            this.selected = action;
            this.$emit('select', {action});
        }
    }
    registerTab(el: Element | any, action: ActionSpecifier) {
        this.tabs.set(this.actionKey(action), el)
    }
    getTab(action: ActionSpecifier) {
        return this.tabs.get(this.actionKey(action));
    }
    getTerminal(action: ActionSpecifier) {
        var t = this.getTab(this.actionKey(action));
        return t && t.querySelector('.area--terminal');
    }

    toolbarAction(ev: MouseEvent) {
        let type = (ev.target as HTMLElement)?.getAttribute('name');
        if (type) this.$emit('action', {type, ev});
    }

    beforeUpdate() {
        this.tabs = new Map;
    }
}

export { IApp }
export default toNative(IApp)
</script>
