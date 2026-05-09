const {premiumDurationTypes} = require('../constant/constant.common');
const helpersCommon = require('./helpers.common');

class HelpersPremium {
    formatPremiumOption(t, data) {
        const durationLabel = `${data.duration} ${t('month')}`;
        const priceSum = `${helpersCommon.formatNumber(data.price_sum)} ${t('sum')}`;
        const stars = data.price_stars ? ` / ⭐️ ${helpersCommon.formatNumber(data.price_stars)}` : '';

        return `${durationLabel} - ${priceSum}${stars}`;
    }

    formatSelectedPremium(t, data) {
        const durationLabel = `${data.duration} ${t('month')}`;
        const priceSum = helpersCommon.formatNumber(data.price_sum);
        const stars = data.price_stars ? ` / ⭐️ ${helpersCommon.formatNumber(data.price_stars)}` : '';

        return `${t('selected_premium_title')
            .replace('{duration}', durationLabel)
            .replace('{price}', priceSum)}${stars}\n\n${t('enter_stars_receiver_title')}`;
    }

    formatPayForSelectedPremium(t, data, username) {
        const durationLabel = `${data.duration} ${t('month')}`;
        const priceSum = helpersCommon.formatNumber(data.price_sum);
        const stars = data.price_stars ? ` / ⭐️ ${helpersCommon.formatNumber(data.price_stars)}` : '';

        return `${t('selected_premium_title')
            .replace('{duration}', durationLabel)
            .replace('{price}', priceSum)}${stars}\n${t('receiver_title', {username})}\n\n${t('make_payment_info')}`;
    }
}

module.exports = new HelpersPremium();