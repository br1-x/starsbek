const {dbTables} = require('../tables');
const {statusTypes} = require('../../paymentIntegrations/click/enum');

module.exports.up = knex => {
    return knex.schema.createTable(dbTables.CLICK_TRANSACTIONS, t => {
        t.increments('id').primary();

        // relation to user transactions
        t.integer('user_transaction_id')
            .unsigned()
            .notNullable()
            .unique()
            .references('id')
            .inTable(dbTables.USER_TRANSACTIONS)
            .onDelete('CASCADE');

        t.enum('current_status', Object.values(statusTypes)).defaultTo(statusTypes.PREPARED);

        t.bigint('click_trans_id').notNullable();
        t.integer('service_id').notNullable();
        t.bigint('click_paydoc_id').notNullable();
        t.string('sign_string').nullable();

        t.timestamp('prepared_at').notNullable().defaultTo(knex.fn.now());
        t.boolean('is_completed').defaultTo(false);
        t.timestamp('completed_at').nullable();

        t.boolean('is_cancelled').defaultTo(false);
        t.timestamp('cancelled_at').nullable();

        t.index('user_transaction_id');
    });
};

module.exports.down = knex => {
    return knex.schema.dropTableIfExists(dbTables.CLICK_TRANSACTIONS);
};
