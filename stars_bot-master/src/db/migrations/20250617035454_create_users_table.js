const {dbTables} = require('../tables');
const {DEFAULT_LANGUAGE, LANGUAGES} = require('../../config');

module.exports.up = knex => {
    return knex.schema.createTable(dbTables.USERS, t => {
        t.increments('id').primary();
        t.bigint('chat_id').unsigned().unique();
        t.string('username').nullable().unique();
        t.string('first_name').nullable();
        t.string('last_name').nullable();
        t.enum('lang', LANGUAGES).defaultTo(DEFAULT_LANGUAGE).notNullable();

        t.string('token').notNullable();
        t.integer('balance').notNullable().defaultTo(0);

        t.boolean('status').defaultTo(true);
        t.timestamp('created_at').defaultTo(knex.fn.now());
        t.timestamp('updated_at').defaultTo(
            knex.raw('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
        );
    });
};

module.exports.down = knex => {
    return knex.schema.dropTable(dbTables.USERS);
};
