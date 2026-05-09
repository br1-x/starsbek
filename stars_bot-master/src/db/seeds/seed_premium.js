const {dbTables} = require('../tables');

module.exports.seed = async function (knex) {
    // Deletes ALL existing entries
    await knex(dbTables.PREMIUM).del();

    await knex(dbTables.PREMIUM).insert([
        {duration: 3, price_sum: 166990, price_stars: 785},
        {duration: 6, price_sum: 223990, price_stars: 1055},
        {duration: 12, price_sum: 399990, price_stars: 1855},
    ]);
};
