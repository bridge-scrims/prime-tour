const ScrimsNamedRow = require("./named_row");

class ScrimsTicketStatus extends ScrimsNamedRow {

    constructor(client, statusData) {

        super(client, statusData);

        /** @type {number} */
        this.id_status

    }

}

module.exports = ScrimsTicketStatus;