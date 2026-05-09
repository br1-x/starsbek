const { CHATS_TO_SUBSCRIBE, BOT_TOKEN, ORDERS_CHANNEL_ID, TIMESTAMP_FORMAT } = require('../config');
const uiMain = require('../ui/ui.main');
const axios = require('axios');
const { productTypes, currencyTypes, statuses } = require('../constant/constant.common');
const helpersCommon = require('../helpers/helpers.common');
const dayjs = require('dayjs');
const helpersUser = require('./helpers.user');

class HelpersTelegram {
    async checkMembership(ctx, user_id) {
        const members = await Promise.all(
            CHATS_TO_SUBSCRIBE.map(chat => ctx.telegram.getChatMember(chat.id, user_id)),
        );

        return members.map(({ status }) => ['member', 'creator', 'administrator'].includes(status));
    }

    async offerMembership(chat_id, ctx) {
        await uiMain.removeKeyboardButtons(ctx);

        const channelsButtons = CHATS_TO_SUBSCRIBE.map(chat => [
            {
                url: chat.link,
                text: ctx.i18n.t('become_member'),
            },
        ]);

        return ctx.telegram.sendMessage(
            chat_id,
            ctx.i18n.t('become_member_title'),
            {
                reply_markup: {
                    inline_keyboard: [
                        ...channelsButtons,
                        [
                            {
                                text: ctx.i18n.t('became_member'),
                                callback_data: 'became_member',
                            },
                        ],
                    ],
                },
            },
        );
    }

    getChatInfo(ctx) {
        const update = ctx.update;
        return (
            update?.message?.from ||
            update?.callback_query?.from ||
            update?.inline_query?.from ||
            update?.edited_message?.from ||
            update?.pre_checkout_query?.from ||
            update?.my_chat_member?.from ||
            update?.chat_member?.from ||
            update?.chat_join_request?.from ||
            null
        );
    }

    async sendMessageToUser(chat_id, text, reply_markup = null, parseMode = 'HTML') {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

        const options = {
            chat_id: chat_id,
            parse_mode: parseMode,
            text: text,
        };

        if (reply_markup)
            options.reply_markup = reply_markup;

        const response = await axios.post(url, options);
        return response.data;
    }

    async deleteMessage(chat_id, message_id) {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`;

        const options = {
            chat_id,
            message_id,
        };

        const response = await axios.post(url, options);
        return response.status === 200;
    }

    async editMessageText(chat_id, message_id, text) {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/editMessageText`;

        const options = {
            chat_id,
            message_id,
            text: text,
            parse_mode: 'HTML', // optional
        };

        const response = await axios.post(url, options);
        return response.status === 200;
    }

    async sendOrderToChannel(t, order, status = statuses.PENDING, should_edit = false) {
        const orderType = order.is_for === productTypes.STARS ? 'Stars' : 'Premium';
        const quantity = helpersCommon.formatNumber(order.quantity);
        const price = helpersCommon.formatNumber(order.payment_amount);
        const timestamp = dayjs(order.created_at).format(TIMESTAMP_FORMAT);

        const text = t('order_info', {
            id: order.id,
            receiver: helpersUser.formatFullName(order),
            order: orderType,
            quantity: order.is_for === productTypes.PREMIUM ? `${quantity} ${t('month')}` : quantity,
            price: order.currency === currencyTypes.SUM ? `${price} ${t('sum')}` : `${price} ⭐️`,
            time: timestamp,
            status: t(status),
        });

        if (should_edit) {
            return await this.editMessageText(
                ORDERS_CHANNEL_ID,
                order.message_id,
                text.concat(
                    '\n\n',
                    t('edited_time', {
                        time: dayjs(order.done_at).format(TIMESTAMP_FORMAT),
                    }),
                ),
            );
        }

        return await this.sendMessageToUser(
            ORDERS_CHANNEL_ID,
            text,
        );
    }
}

module.exports = new HelpersTelegram();