const {dbTables} = require('../tables');

module.exports.up = knex => {
    return knex.schema.createTable(dbTables.PREMIUM, t => {
        t.increments('id').primary();
        t.tinyint('duration').notNullable(); //in months
        t.integer('price_sum').notNullable();
        t.integer('price_stars').nullable();

        t.boolean('status').defaultTo(true);

        t.timestamp('created_at').defaultTo(knex.fn.now());
        t.timestamp('updated_at').defaultTo(
            knex.raw('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
        );
    });
};

module.exports.down = knex => {
    return knex.schema.dropTable(dbTables.PREMIUM);
};
