const ScrimsNamedRow = require("./named_row");

class ScrimsType extends ScrimsNamedRow {

    constructor(client, typeData) {

        super(client, typeData);

        /** @type {number} */
        this.id_type

    }

    /** @override */
    get uniqueKeys() {
        return ['id_type']
    }

    /** @override */
    get columns() {
        return ['id_type', 'name']
    }

}

module.exports = ScrimsType;