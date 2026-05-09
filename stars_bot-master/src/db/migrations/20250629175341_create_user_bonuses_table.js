const {dbTables} = require('../tables');

module.exports.up = knex => {
    return knex.schema.createTable(dbTables.USER_BONUSES, t => {
        t.increments('id').primary();
        t
            .integer('user_id')
            .unsigned()
            .notNullable()
            .references('id')
            .inTable(dbTables.USERS)
            .onDelete('CASCADE');

        t
            .integer('transaction_id')
            .unsigned()
            .nullable()
            .references('id')
            .inTable(dbTables.USER_TRANSACTIONS)
            .onDelete('NO ACTION');

        t.integer('bonus').unsigned().notNullable();
        t.enum('source', ['referral', 'stars', 'referral_first_join']);

        t.boolean('status').notNullable().defaultTo(true);
        t.timestamp('created_at').defaultTo(knex.fn.now());
        t.timestamp('updated_at').defaultTo(
            knex.raw('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
        );
    });
};

module.exports.down = knex => {
    return knex.schema.dropTable(dbTables.USER_BONUSES);
};
