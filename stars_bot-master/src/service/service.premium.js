const ServiceBase = require('./service.base');

const {dbTables} = require('../db/tables');

class ServicePremium extends ServiceBase {
    constructor() {
        super(dbTables.PREMIUM);
    }
}

module.exports = new ServicePremium();