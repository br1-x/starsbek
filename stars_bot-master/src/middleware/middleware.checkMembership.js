const helpersTelegram = require('../helpers/helpers.telegram');

module.exports = async (ctx, next) => {
    const user = ctx.session?.user;

    if (!user) {
        return next();
    }

    const {chat_id} = user;

    const status = await helpersTelegram.checkMembership(ctx, chat_id);

    if (status.every(Boolean))
        return next();

    if (ctx.session?.membership_message_id) {
        await ctx.telegram.deleteMessage(chat_id, ctx.session.membership_message_id);
    }

    const message = await helpersTelegram.offerMembership(chat_id, ctx);
    ctx.session.membership_message_id = message.message_id;
};