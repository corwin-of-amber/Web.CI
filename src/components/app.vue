<template>
    <div id="app">
        <ul>
            <li v-for="action in actions" :key="action"
                :class="{selected: action == selected}"
                @click="selectAction(action, $event)">
                {{action}}
                <span class="action--status" v-if="status.has(action)">
                    {{status.get(action)}}
                </span>
            </li>
        </ul>
        <div id="area">
            <div v-for="action in actions" :key="action"
                :ref="registerTab" :data-action="action"
                class="area--tab" :class="{active: action == selected}">
                <div class="area--terminal" v-once/>
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
export default {
    props: ['actions'],
    data: () => ({selected: undefined, status: new Map}),
    methods: {
        selectAction(action: string, ev: MouseEvent) {
            this.selected = action;
        },
        registerTab(el: Element) {
            this.tabs.set(el.getAttribute('data-action'), el)
        },
        getTab(action: string) {
            return this.tabs.get(action);
        },
        getTerminal(action: string) {
            var t = this.getTab(action);
            return t && t.querySelector('.area--terminal');
        }
    },
    beforeUpdate() { this.tabs = new Map; }
}
</script>
