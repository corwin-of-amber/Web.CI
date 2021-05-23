<template>
    <div id="app">
        <ul>
            <li v-for="action in actions" :key="action"
                :class="{selected: action == selected}"
                @click="selectAction(action, $event)">
                {{action}}
            </li>
        </ul>
        <div id="area">
            <div v-for="action in actions" :key="action"
                :data-action="action"
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
</style>

<script lang="ts">
export default {
    props: ['actions'],
    data: () => ({selected: undefined}),
    methods: {
        selectAction(action: string, ev: MouseEvent) {
            this.selected = action;
        }
    }
}
</script>
