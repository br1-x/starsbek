const {Extra, Markup} = require('telegraf');

class UiAdmin {
    requestPost(ctx) {
        ctx.reply(
            ctx.i18n.t('request_post'),
            Extra.markdown().markup(
                Markup.keyboard([[Markup.button(ctx.i18n.t('cancel'))]]).resize(),
            ),
        );
    };

}

module.exports = new UiAdmin();