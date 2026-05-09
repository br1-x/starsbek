const ServiceBase = require('./service.base');
const {dbTables} = require('../db/tables');
const db = require('../db/db');
const {LANGUAGES, DEFAULT_LANGUAGE} = require('../config');
const crypto = require('crypto');

class ServiceUser extends ServiceBase {
    constructor() {
        super(dbTables.USERS);
    }

    readOneByChatId(chat_id) {
        return db(`${dbTables.USERS} as t1`)
            .select(
                't1.*',
                't2.steps',
            )
            .leftJoin(`${dbTables.USER_STEPS} as t2`, 't1.id', 't2.user_id')
            .where('t1.chat_id', chat_id)
            .first();
    }

    readUserByToken(token) {
        return db(dbTables.USERS)
            .select('*')
            .where('token', token)
            .first();
    }

    async create(chatInfo) {
        const token = crypto.randomBytes(15).toString('hex');

        const [userId] = await db(dbTables.USERS)
            .insert({
                chat_id: chatInfo.id,
                first_name: chatInfo.first_name,
                last_name: chatInfo.last_name,
                username: chatInfo.username,
                ...(chatInfo.language_code ? {lang: LANGUAGES.includes(chatInfo.language_code) ? chatInfo.language_code : DEFAULT_LANGUAGE} : {}),
                token: token,
            });

        await db(dbTables.USER_STEPS).insert({user_id: userId});

        return this.readOneByChatId(chatInfo.id);
    }

    updateUserSteps(user_id, steps = []) {
        return db(dbTables.USER_STEPS)
            .update({
                steps: JSON.stringify(steps),
            })
            .where('user_id', user_id);
    }

    async readUserBalance(user_id) {
        const bonusResult = await db(dbTables.USER_BONUSES)
            .sum('bonus as total')
            .where({user_id, status: 1})
            .first();

        const paymentsResult = await db(dbTables.BONUS_PAYMENT)
            .sum('amount as total')
            .where({user_id})
            .first();

        const bonus = bonusResult?.total || 0;
        const payments = paymentsResult?.total || 0;

        return bonus - payments;
    }
}

module.exports = new ServiceUser();