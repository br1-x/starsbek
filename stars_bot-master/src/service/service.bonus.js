const ServiceBase = require('./service.base');
const {dbTables} = require('../db/tables');
const db = require('../db/db');
const {bonusPurposeTypes} = require('../constant/constant.common');

class ServiceBonus extends ServiceBase {
    constructor() {
        super(dbTables.BONUSES);
    }

    readAll(is_for = bonusPurposeTypes.STARS) {
        return db(dbTables.BONUSES).select('*').where('is_for', is_for);
    }

    readBonusMatchingStars(stars_quantity, is_for = bonusPurposeTypes.STARS) {
        return db(dbTables.BONUSES)
            .select(
                'id',
                'from_stars',
                'till_stars',
                'quantity',
                'type',
                'is_for',
            )
            .where('from_stars', '<=', stars_quantity)
            .andWhere('till_stars', '>=', stars_quantity)
            .andWhere({
                is_for,
                status: 1,
            })
            .first();
    }
}

module.exports = new ServiceBonus();