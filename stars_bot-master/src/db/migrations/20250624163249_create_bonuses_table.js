const {dbTables} = require('../tables');

module.exports.up = knex => {
    return knex.schema.createTable(dbTables.BONUSES, (t) => {
        t.increments('id').primary();

        t.integer('from_stars').notNullable();  //including
        t.integer('till_stars').notNullable();  //including

        t.float('quantity');
        t.enum('type', ['number', 'percentage']).defaultTo('number');
        t.enum('is_for', ['stars', 'referral']).defaultTo('stars');

        t.boolean('status').defaultTo(true);

        t.timestamp('created_at').defaultTo(knex.fn.now()).notNullable();
        t.timestamp('updated_at').defaultTo(
            knex.raw('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'),
        );
    });
};

module.exports.down = knex => {
    return knex.schema.dropTable(dbTables.BONUSES);
};
