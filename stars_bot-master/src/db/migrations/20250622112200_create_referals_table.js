const {dbTables} = require('../tables');

module.exports.up = knex => {
    return knex.schema.createTable(dbTables.REFERRALS, t => {
        t.increments('id').primary();
        t.integer('sender_id').notNullable().unsigned().references('id').inTable(dbTables.USERS).onDelete('CASCADE');
        t.integer('receiver_id').notNullable();

        t.boolean('status').notNullable().defaultTo(true);

        t.timestamp('created_at').defaultTo(knex.fn.now());
    });
};

module.exports.down = knex => {
    return knex.schema.dropTable(dbTables.REFERRALS);
};
