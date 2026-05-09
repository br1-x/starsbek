const {dbTables} = require('../db/tables');
const ServiceBase = require('./service.base');

class ServiceBonusPayment extends ServiceBase {
    constructor() {
        super(dbTables.BONUS_PAYMENT);
    }
}

module.exports = new ServiceBonusPayment();