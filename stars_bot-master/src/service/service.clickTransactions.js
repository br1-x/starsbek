const ServiceBase = require('./service.base');
const {dbTables} = require('../db/tables');
const db = require('../db/db');

class ClickTransactionsService extends ServiceBase {
    constructor() {
        super(dbTables.CLICK_TRANSACTIONS);
    }

    readByUserTransactionId(user_transaction_id) {
        return db
            .select(
                'a.is_paid',
                'a.is_done',
                'a.payment_amount',
                'b.*',
            )
            .from({a: dbTables.USER_TRANSACTIONS})
            .leftJoin({b: dbTables.CLICK_TRANSACTIONS}, 'a.id', 'b.user_transaction_id')
            .where('a.id', user_transaction_id)
            .first();
    }

    createOrUpdate(data) {
        return db(dbTables.CLICK_TRANSACTIONS)
            .insert(data)
            .onConflict('user_transaction_id')
            .merge();
    }
}

module.exports = new ClickTransactionsService();