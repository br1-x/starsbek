const ServiceBase = require('./service.base');
const {dbTables} = require('../db/tables');

class ServiceUserBonus extends ServiceBase {
    constructor() {
        super(dbTables.USER_BONUSES);
    }
}

module.exports = new ServiceUserBonus();