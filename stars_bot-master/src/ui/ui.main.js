const {Markup} = require('telegraf');
const {USER_BUTTONS, roles, ADMIN_BUTTONS} = require('../config');
const serviceUsers = require('../service/service.user');

class UiMain {
    getMenuButtons(ctx) {
        const buttons = ctx.session.user.role === roles.ADMIN ? ADMIN_BUTTONS : USER_BUTTONS;

        return buttons.map(keys =>
            keys.map(key => Markup.button.text(ctx.i18n.t(key))),
        );
    }

    async menu(ctx, text_key = 'welcome') {
        const user = ctx.session.user;

        await serviceUsers.updateUserSteps(
            user.id,
            [],
        );

        await ctx.replyWithHTML(
            ctx.i18n.t(text_key),
            {
                parse_mode: 'HTML',
                reply_markup: {
                    keyboard: this.getMenuButtons(ctx),
                    resize_keyboard: true,
                },
            },
        );
    }

    async selectLanguage(ctx) {
        const buttons = [
            [Markup.button.callback('🇺🇿 O\'zbekcha', `lang.uz`)],
            [Markup.button.callback('🇷🇺 Русский', `lang.ru`)],
            [Markup.button.callback('🇬🇧 English', `lang.en`)],
            [Markup.button.callback('🇺🇿 Qaraqalpaqsha', `lang.kaa`)],
        ];

        await ctx.replyWithHTML(
            ctx.i18n.t('select_language'),
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: buttons,
                },
            },
        );
    };

    async removeKeyboardButtons(ctx) {
        const placeholder = await ctx.reply('...', {
            reply_markup: {remove_keyboard: true},
        });

        await ctx.telegram.deleteMessage(
            placeholder.chat.id,
            placeholder.message_id,
        );
    }
}

module.exports = new UiMain();