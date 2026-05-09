const serviceUsers = require('../service/service.user');
const helpersTelegram = require('../helpers/helpers.telegram');
const uiMain = require('../ui/ui.main');
const serviceReferrals = require('../service/service.referral');
const serviceUserBonus = require('../service/service.userBonus');
const controllerMain = require('../controller/controller.main');
const {GROUP_ID, BONUS_PER_REFERRAL} = require('../config');
const {bonusPurposeTypes} = require('../constant/constant.common');

const setLanguage = ctx => {
    if (ctx.session?.user?.lang) {
        ctx.i18n.changeLanguage(ctx.session.user.lang);
    }
};

module.exports = async (ctx, next) => {
    // console.log(ctx.update);

    // To detect posting and ignore it when text and event come from channel
    if (ctx.update.channel_post || ctx.update.my_chat_member) {
        return;
    }

    if (!ctx.session) {
        ctx.session = {};
    }

    const message = ctx.update.message;
    if (message) {
        if (message.text?.startsWith('/start')) {
            ctx.session = {};

        } else if (message.chat.id === GROUP_ID) {
            if (message?.reply_to_message) {
                await controllerMain.replyToUserMessage(ctx, message);
            }

            return;
        }
    }

    if (!ctx.session.user) {
        const chatInfo = helpersTelegram.getChatInfo(ctx);

        if (chatInfo) {
            const user = await serviceUsers.readOneByChatId(chatInfo.id);

            if (user) {
                ctx.session.user = user;
                setLanguage(ctx);

            } else {
                ctx.session.user = await serviceUsers.create(chatInfo);

                setLanguage(ctx);

                if (ctx.update.message?.text?.startsWith('/start')) {
                    const start = ctx.message.text.split(' ');

                    if (start.length === 2) {
                        const [type, data] = start[1].split('_');
                        switch (type) {
                            case 'ref':
                                const referrer = await serviceUsers.readUserByToken(data);
                                if (referrer) {
                                    await serviceReferrals.create({
                                        sender_id: referrer.id,
                                        receiver_id: ctx.session.user.id,
                                    });
                                    // await serviceUserBonus.create({
                                    //     user_id: referrer.id,
                                    //     bonus: BONUS_PER_REFERRAL,
                                    //     source: bonusPurposeTypes.REFERRAL_FIRST_JOIN,
                                    // });
                                }
                                break;
                        }
                    }
                }

                await ctx.replyWithHTML(ctx.i18n.t('hello'));
                await uiMain.selectLanguage(ctx);

                return;
            }
        }
    }

    if (ctx.session.user?.id && [723, 1433].includes(ctx.session.user.id)) {
        return;
    }

    return next();
};
