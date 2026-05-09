const {dbTables} = require('../tables');

module.exports.up = function (knex) {
    return knex.schema.createTable(dbTables.USER_STEPS, (t) => {
        t.increments('id').primary();
        t.integer('user_id').unsigned().unique().notNullable().references('id').inTable(dbTables.USERS).onDelete('CASCADE');
        t.json('steps').notNullable().defaultTo([]);

        t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
        t.timestamp('updated_at').defaultTo(
            knex.raw('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
        );
    });
};

module.exports.down = async function (knex) {
    await knex.schema.dropTableIfExists(dbTables.USER_STEPS);
};
