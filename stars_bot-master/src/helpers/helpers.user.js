const dayjs = require('dayjs');
const {TIMESTAMP_FORMAT, paymentSystems, BOT_USERNAME} = require('../config');
const {Markup} = require('telegraf');
const helpersCommon = require('./helpers.common');

class HelpersUser {
    formatProfileInfo(t, balance, referrals_quantity, referral_link) {
        return [
            t('profile_info', {
                stars: helpersCommon.formatNumber(balance),
                count: referrals_quantity,
            }),
            // t('referral_ad_info', {count: BONUS_PER_REFERRAL}),
            `${t('referral_link')}:\n<code>${referral_link}</code>`,
        ].join('\n\n');
    }

    getLastStep(ctx) {
        const steps = ctx.session.user.steps;
        return steps[steps.length - 1];
    }

    formatUserOffer(t, user, text) {
        const full_name = (user.last_name ? user.last_name + ' ' : '') + user.first_name;

        return [
            `<b>${t('user_offers_title')}</b>`,
            `🆔 ${user.chat_id}`,
            `👤 ${full_name}`,
            `${t('username')}: @${user.username}`,
            `📝 ${text}`,
            `🕔 ${dayjs().format(TIMESTAMP_FORMAT)}`,
        ].join('\n\n');
    }

    extractId(text) {
        const match = text.match(/🆔\s*(\d+)/);
        return match ? Number(match[1]) : null;
    }

    async generatePaymentSystemsButtons(ctx, order) {
        const t = ctx.i18n.t;

        const clickLink = `${paymentSystems.click.BASE_URL}?service_id=${paymentSystems.click.SERVICE_ID}&merchant_id=${paymentSystems.click.MERCHANT_ID}&merchant_user_id=${paymentSystems.click.MERCHANT_USER_ID}&amount=${order.payment_amount}&transaction_param=${order.id}&return_url=https://t.me/${BOT_USERNAME}?start=`;

        return [
            [
                Markup.button.url(t('pay_by_click'), clickLink),
            ],
        ];
    }

    formatFullName(data) {
        return [
            data.first_name || '',
            data.last_name || '',
        ].join(' ').trim();
    }
}

module.exports = new HelpersUser();