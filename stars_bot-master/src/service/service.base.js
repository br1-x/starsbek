const db = require('../db/db');

class ServiceBase {
    constructor(table) {
        this.table = table;
    }

    readOneById(id) {
        return db(this.table).select('*').where('id', id).first();
    }

    readAll() {
        return db(this.table).select('*');
    }

    create(data) {
        return db(this.table).insert(data);
    }

    updateOneById(id, data) {
        return db(this.table).update(data).where('id', id);
    }
}

module.exports = ServiceBase;