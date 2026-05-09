const {dbTables} = require('../tables');
const {starsBonusTypes, bonusPurposeTypes} = require('../../constant/constant.common');

module.exports.seed = async function (knex) {
    // Deletes ALL existing entries
    await knex(dbTables.BONUSES).del();

    await knex(dbTables.BONUSES).insert([
        {
            from_stars: 50,
            till_stars: 100,
            quantity: 0,
        },
        {
            from_stars: 101,
            till_stars: 300,
            quantity: 2,
        },
        {
            from_stars: 301,
            till_stars: 500,
            quantity: 4,
        },
        {
            from_stars: 501,
            till_stars: 1500,
            quantity: 1,
            type: starsBonusTypes.PERCENTAGE,
        },
        {
            from_stars: 1501,
            till_stars: 6000,
            quantity: 1.5,
            type: starsBonusTypes.PERCENTAGE,
        },
        {
            from_stars: 6001,
            till_stars: 10000,
            quantity: 2,
            type: starsBonusTypes.PERCENTAGE,
        },
        {
            from_stars: 10001,
            till_stars: 1000000,
            quantity: 2.6,
            type: starsBonusTypes.PERCENTAGE,
        },

        //
        {
            from_stars: 50,
            till_stars: 150,
            quantity: 0,
            is_for: bonusPurposeTypes.REFERRAL,
        },
        {
            from_stars: 151,
            till_stars: 300,
            quantity: 2,
            is_for: bonusPurposeTypes.REFERRAL,
        },
        {
            from_stars: 301,
            till_stars: 500,
            quantity: 3,
            is_for: bonusPurposeTypes.REFERRAL,
        },
        {
            from_stars: 501,
            till_stars: 1500,
            quantity: 1,
            type: starsBonusTypes.PERCENTAGE,
            is_for: bonusPurposeTypes.REFERRAL,
        },
    ]);
};
