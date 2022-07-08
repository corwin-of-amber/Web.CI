
class ViviMap<K, V> extends Map<K, V> {
    factory: (key: K) => V = () => undefined;

    withFactory(factory: (key: K) => V) {
        this.factory = factory;
        return this;
    }

    get(key: K) {
        var v = super.get(key);
        if (v === undefined)
            super.set(key, v = this.factory(key));
        return v;
    }
}


export { ViviMap }
