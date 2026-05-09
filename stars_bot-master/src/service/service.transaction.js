const ServiceBase = require('./service.base');
const db = require('../db/db');
const { dbTables } = require('../db/tables');

class ServiceTransaction extends ServiceBase {
    constructor() {
        super(dbTables.USER_TRANSACTIONS);
    }

    readWithUserInfo(id) {
        return db
            .select(
                'u.username',
                'u.chat_id',
                'u.lang',
                'u.first_name',
                'u.last_name',
                'r.sender_id as sender_id',
                's.chat_id as sender_chat_id',
                'u_t.*',
            )
            .from({ u_t: dbTables.USER_TRANSACTIONS })
            .leftJoin({ u: dbTables.USERS }, 'u_t.user_id', 'u.id')
            .leftJoin({ r: dbTables.REFERRALS }, 'r.receiver_id', 'u.id')
            .leftJoin({ s: dbTables.USERS }, 'r.sender_id', 's.id')
            .where('u_t.id', id)
            .first();
    }

    create(data) {
        return db(dbTables.USER_TRANSACTIONS)
            .insert(data)
            .then(([rowId]) => this.readWithUserInfo(rowId));
    }

    readTransIdFromToken(token) {
        return db(dbTables.USER_TRANSACTIONS).select('id').where({ token: token }).first()
    }
}

module.exports = new ServiceTransaction();