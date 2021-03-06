export interface App {
    actions: string[]
    status: Map<string, string>
    selectAction(action: string): void
    getTab(action: string): HTMLElement
    getTerminal(action: string): HTMLElement
}
