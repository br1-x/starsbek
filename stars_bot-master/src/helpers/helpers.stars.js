const helpersCommon = require('./helpers.common');
const {starsBonusTypes} = require('../constant/constant.common');
const {stars} = require('../config');

class HelpersStars {
    calculateBonus(stars_quantity, bonus) {
        if (!bonus) {
            return bonus;
        }

        const result = bonus.type === starsBonusTypes.NUMBER
            ? bonus.quantity
            : helpersCommon.calculatePercentage(stars_quantity, bonus.quantity);

        return +helpersCommon.formatNumber(result || 0);
    }

    formatStarsOption(ctx, stars_quantity, bonus) {
        const bonusQuantity = this.calculateBonus(stars_quantity, bonus);

        return `⭐️ ${helpersCommon.formatNumber(stars_quantity)}`
            .concat(bonusQuantity > 0 ? ` + ${bonusQuantity}` : '')
            .concat(' - ', `${helpersCommon.formatNumber(stars_quantity * stars.ONE_STAR_PRICE)} ${ctx.i18n.t('sum')}`);
    }

    formatSelectedStars(translate, stars_quantity, bonus, username) {
        const bonusAmount = this.calculateBonus(stars_quantity, bonus);
        const formattedStars = helpersCommon.formatNumber(stars_quantity);
        const formattedPrice = helpersCommon.formatNumber(stars_quantity * stars.ONE_STAR_PRICE);

        let text = `⭐️ ${translate.t('stars')}: <b>${formattedStars}</b>\n`;

        if (bonusAmount) {
            const formattedAllStars = helpersCommon.formatNumber(stars_quantity + bonusAmount);
            text += `💰 ${translate.t('bonus')}: <b>${bonusAmount}</b>\n`;
            text += `🤩 ${translate.t('total')}: <b>${formattedAllStars}</b>\n`;
        }

        text += `💴 ${translate.t('price')}: <b>${formattedPrice}</b> ${translate.t('sum')}`;

        if (username) {
            text += `\n${translate.t('receiver_title', {username})}\n\n${translate.t('make_payment_info')}`;
        } else {
            text += `\n\n${translate.t('enter_stars_receiver_title')}`;
        }

        return text;
    }
}

module.exports = new HelpersStars();