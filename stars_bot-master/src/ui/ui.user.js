const { Markup } = require('telegraf');

const { BOT_USERNAME, stars, BALANCE_RETRIEVE_OPTIONS } = require('../config');
const helpersStars = require('../helpers/helpers.stars');
const helpersUser = require('../helpers/helpers.user');
const helpersPremium = require('../helpers/helpers.premium');
const helpersCommon = require('../helpers/helpers.common');
const uiMain = require('./ui.main');

class UiUser {
    async showStarsOptions(ctx, bonuses, should_edit) {
        const buttons = stars.OPTIONS.map(starQuantity => {
            const bonus = bonuses.find(bonus => bonus.from_stars <= starQuantity && bonus.till_stars >= starQuantity);

            return [
                Markup.button.callback(
                    helpersStars.formatStarsOption(ctx, starQuantity, bonus),
                    `star.${starQuantity}`,
                ),
            ];
        });

        buttons.push([Markup.button.callback(ctx.i18n.t('back'), 'back')]);

        const message = ctx.i18n.t('select_or_enter_stars')
            .replace('{star_price}', stars.ONE_STAR_PRICE)
            .replace('{min_stars}', stars.MIN_STARS_QUANTITY)
            .replace('{max_stars}', helpersCommon.formatNumber(stars.MAX_STARS_QUANTITY));

        const extra = {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: buttons,
            },
        };

        if (should_edit) {
            return await ctx.editMessageText(message, extra);
        } else {
            // await uiMain.removeKeyboardButtons(ctx);
            await ctx.reply('🌟', {
                reply_markup: { remove_keyboard: true },
            })
            return await ctx.replyWithHTML(message, extra);
        }
    };

    async showSelectedStarsInfo(ctx, stars_quantity, bonus, should_edit = false) {
        const extra = {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    [
                        Markup.button.callback(ctx.i18n.t('to_myself'), 'receiver_myself.stars')
                    ],
                    [
                        Markup.button.callback(ctx.i18n.t('back'), `back`),
                        Markup.button.callback(ctx.i18n.t('cancel'), `cancel`)
                    ],
                ],
            },
        };

        const message = helpersStars.formatSelectedStars(
            ctx.i18n,
            stars_quantity,
            bonus,
        );

        let sentMessInfo;
        if (should_edit) {
            sentMessInfo = await ctx.editMessageText(message, extra);

        } else {
            sentMessInfo = await ctx.replyWithHTML(message, extra);
        }

        const lastStep = helpersUser.getLastStep(ctx);
        lastStep.messageId = sentMessInfo.message_id;
    }

    async payForStars(ctx, transaction, is_edit = true) {
        const { stars, bonus, username } = helpersUser.getLastStep(ctx);

        const newMessage = helpersStars.formatSelectedStars(
            ctx.i18n,
            stars,
            bonus,
            username,
        );

        const paymentButtons = await helpersUser.generatePaymentSystemsButtons(
            ctx,
            transaction,
        );

        const extra = {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    ...paymentButtons,
                    [
                        Markup.button.callback(ctx.i18n.t('back'), `back`),
                        Markup.button.callback(ctx.i18n.t('cancel'), `cancel`)
                    ],
                ],
            },
        };

        if (is_edit) {
            return await ctx.editMessageText(
                newMessage,
                extra,
            );

        } else {
            return await ctx.replyWithHTML(
                newMessage,
                extra,
            );
        }
    }

    async showMyProfile(ctx, { userBalance, referralsQuantity }, should_edit) {
        const user = ctx.session.user;

        const referralLink = `https://t.me/${BOT_USERNAME}?start=ref_${user.token}`;

        const text = helpersUser.formatProfileInfo(
            ctx.i18n.t,
            userBalance,
            referralsQuantity,
            referralLink,
        );

        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(ctx.i18n.t('share_referral_title'))}`;
        const buttons = [
            [Markup.button.url(ctx.i18n.t('share_referral'), shareUrl)],
            [Markup.button.callback(ctx.i18n.t('retrieve_balance'), 'get_balance')],
            [Markup.button.callback(ctx.i18n.t('back'), 'back')],
        ];

        if (should_edit) {
            await ctx.editMessageText(
                text,
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: buttons,
                    },
                },
            );

        } else {
            await uiMain.removeKeyboardButtons(ctx);

            await ctx.replyWithHTML(
                text,
                {
                    reply_markup: {
                        inline_keyboard: buttons,
                    },
                },
            );
        }
    }

    async showRetrieveBalanceOptions(ctx, balance) {
        const t = ctx.i18n.t;

        const buttons = [
            BALANCE_RETRIEVE_OPTIONS.map(item =>
                Markup.button.callback(`${item} ⭐️`, `get_balance_amount.${item}`),
            ),
        ];

        buttons.push(
            [
                Markup.button.callback(t('all'), `get_balance_amount.all`),
            ],
            [
                Markup.button.callback(ctx.i18n.t('back'), `back`),
                Markup.button.callback(ctx.i18n.t('cancel'), `cancel`)
            ],
        );

        const text = t('retrieve_balance_info', { balance });

        await ctx.editMessageText(text, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: buttons,
            },
        });
    }

    async showPremiumList(ctx, premium_options, should_edit) {
        const buttons = [
            ...premium_options.map(item => [{
                text: helpersPremium.formatPremiumOption(ctx.i18n.t, item),
                callback_data: `premium.${item.id}`,
            }]),
            [Markup.button.callback(ctx.i18n.t('back'), 'back')],
        ];

        const extra = {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: buttons,
            },
        };

        if (should_edit) {
            await ctx.editMessageText(
                ctx.i18n.t('premium_options_title'),
                extra,
            );

        } else {
            // await uiMain.removeKeyboardButtons(ctx);
            await ctx.reply('💎', {
                reply_markup: { remove_keyboard: true },
            })
            await ctx.replyWithHTML(
                ctx.i18n.t('premium_options_title'),
                extra,
            );
        }
    }

    async showSelectedPremiumInfo(ctx, premium_info) {
        await ctx.editMessageText(
            helpersPremium.formatSelectedPremium(ctx.i18n.t, premium_info),
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            Markup.button.callback(ctx.i18n.t('to_myself'), 'receiver_myself.premium')
                        ],
                        [
                            Markup.button.callback(ctx.i18n.t('back'), `back`),
                            Markup.button.callback(ctx.i18n.t('cancel'), `cancel`)
                        ],
                    ],
                },
            },
        );
    }

    async payForPremium(ctx, premium, username, transaction, is_edit = true) {
        const newMessage = helpersPremium.formatPayForSelectedPremium(
            ctx.i18n.t,
            premium,
            username,
        );

        const paymentButtons = await helpersUser.generatePaymentSystemsButtons(
            ctx,
            transaction,
        );

        const extra = {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [
                    ...paymentButtons,
                    [
                        Markup.button.callback(ctx.i18n.t('pay_with_stars'), 'pay_premium_by_star')
                    ],
                    [
                        Markup.button.callback(ctx.i18n.t('back'), `back`),
                        Markup.button.callback(ctx.i18n.t('cancel'), `cancel`)
                    ],
                ],
            },
        };

        if (is_edit) {
            return await ctx.editMessageText(
                newMessage,
                extra,
            );

        } else {
            return await ctx.replyWithHTML(
                newMessage,
                extra,
            );
        }
    }

    async sendOffers(ctx) {
        await ctx.replyWithHTML(
            ctx.i18n.t('user_offers_info'),
            {
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: [
                        [
                            { text: ctx.i18n.t('cancel') },
                        ],
                    ],
                    resize_keyboard: true,
                },
            },
        );
    }
}

module.exports = new UiUser();