const { dbTables } = require('../tables');

module.exports.up = knex => {
    return knex.schema.createTable(dbTables.USER_TRANSACTIONS, t => {
        t.increments('id').primary();
        t.string('transaction_id').nullable();
        t.bigint('message_id').nullable();
        t
            .integer('user_id')
            .unsigned()
            .notNullable()
            .references('id')
            .inTable(dbTables.USERS)
            .onDelete('CASCADE');

        t.string('receiver').notNullable();

        t.enum('is_for', ['stars', 'premium']).defaultTo('stars').notNullable();
        t.integer('quantity').unsigned().notNullable();

        t.enum('currency', ['sum', 'stars']).defaultTo('sum').notNullable();
        t.integer('payment_amount').unsigned().notNullable();
        t.string('payment_method').nullable();

        t.boolean('is_paid').notNullable().defaultTo(false);
        t.timestamp('paid_at').nullable();
        t.string('tg_payment_id').nullable();

        t.boolean('is_done').notNullable().defaultTo(false);
        t.timestamp('done_at').nullable();

        t.timestamp('created_at').defaultTo(knex.fn.now());
        t.timestamp('updated_at').defaultTo(
            knex.raw('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
        );
    });
};

module.exports.down = knex => {
    return knex.schema.dropTableIfExists(dbTables.USER_TRANSACTIONS);
};
