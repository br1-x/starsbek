const {dbTables} = require('../tables');

module.exports.up = knex => {
    return knex.schema.createTable(dbTables.BONUS_PAYMENT, t => {
        t.increments('id').primary();
        t
            .integer('user_id')
            .unsigned()
            .notNullable()
            .references('id')
            .inTable(dbTables.USERS)
            .onDelete('CASCADE');

        t.integer('amount').unsigned().notNullable();
        t.enum('currency', ['stars']).defaultTo('stars');

        t.timestamp('created_at').defaultTo(knex.fn.now());
    });
};

module.exports.down = knex => {
    return knex.schema.dropTable(dbTables.BONUS_PAYMENT);
};
