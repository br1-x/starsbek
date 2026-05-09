const ServiceBase = require('./service.base');
const {dbTables} = require('../db/tables');
const db = require('../db/db');

class ServiceReferral extends ServiceBase {
    constructor() {
        super(dbTables.REFERRALS);
    }

    readUserReferrals(user_id) {
        return db(dbTables.REFERRALS)
            .select('*')
            .where('sender_id', user_id);
    }

    readUserReferralsCount(user_id) {
        return db(dbTables.REFERRALS)
            .where('sender_id', user_id)
            .count('* as count')
            .first()
            .then(result => Number(result.count));
    }
}

module.exports = new ServiceReferral();