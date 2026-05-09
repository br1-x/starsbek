const serviceBonuses = require('../service/service.bonus');
const servicePremium = require('../service/service.premium');
const serviceReferrals = require('../service/service.referral');
const serviceUsers = require('../service/service.user');
const serviceTransaction = require('../service/service.transaction');
const serviceBonusPayment = require('../service/service.bonusPayment');

const uiUser = require('../ui/ui.user');

const { starsQuantitySchema } = require('../validations/validations.main');
const { stars, GROUP_ID, GROUP_MESSAGES_LANGUAGE, BALANCE_RETRIEVE_OPTIONS } = require('../config');
const { helpersCommon, helpersHttp, helpersUser, helpersTelegram, helpersCrypto } = require('../helpers');
const { userSteps } = require('../constant/constant.userSteps');
const uiMain = require('../ui/ui.main');
const { productTypes, receivedUsernameFor } = require('../constant/constant.common');
const { logError } = require('../logs/logs');

class ControllerUser {
    addUserStep(ctx, new_step) {
        const user = ctx.session.user;
        const lastStep = user.steps.at(-1);

        if (lastStep?.key !== new_step.key) {
            user.steps.push(new_step);

        } else {
            user.steps[user.steps.length - 1] = new_step;
        }

        serviceUsers.updateUserSteps(
            user.id,
            user.steps,
        );
    }

    async rollbackStep(ctx, count = 1) {
        const user = ctx.session.user;

        if (count === -1) {
            user.steps = [];

        } else {
            ctx.session.user.steps.splice(-count);
        }

        const currentStep = user.steps[user.steps.length - 1];

        switch (currentStep?.key) {
            case userSteps.STARS_OPTIONS:
                await this.showStarsOptions(ctx, true);
                break;

            case userSteps.SELECTED_STARS_OPTION:
                await this.showSelectedStarsInfo(
                    ctx,
                    currentStep.stars,
                    true,
                );
                break;

            case userSteps.PREMIUM_OPTIONS:
                await this.showPremiumOptions(ctx, true);
                break;

            case userSteps.SELECTED_PREMIUM_OPTION:
                await this.showSelectedPremiumInfo(
                    ctx,
                    currentStep.premium.id,
                    true,
                );
                break;

            case userSteps.MY_PROFILE:
                await this.showMyProfile(ctx, true);
                break;
            default:
                await ctx.deleteMessage().catch((err) => { });
                await uiMain.menu(ctx);
        }
    }

    async showStarsOptions(ctx, should_edit = false) {
        const bonuses = await serviceBonuses.readAll();
        const { message_id } = await uiUser.showStarsOptions(ctx, bonuses, should_edit);

        this.addUserStep(ctx, {
            key: userSteps.STARS_OPTIONS,
            messageId: message_id,
        });
    }

    async receiveStarsNumber(ctx, stars_quantity) {
        const { chat_id, steps } = ctx.session.user;
        const lastStep = steps[steps.length - 1];

        const { error } = starsQuantitySchema.validate(stars_quantity);

        if (error) {
            await ctx.replyWithHTML(
                ctx.i18n.t('must_enter_number_between')
                    .replace('{min}', stars.MIN_STARS_QUANTITY)
                    .replace('{max}', helpersCommon.formatNumber(stars.MAX_STARS_QUANTITY)),
            );
            return;
        }

        await helpersTelegram.deleteMessage(chat_id, lastStep.messageId)
            .catch(e => logError(e.toString()));

        await this.showSelectedStarsInfo(ctx, stars_quantity, false);
    }

    async showSelectedStarsInfo(ctx, stars_quantity, should_edit = false) {
        const bonus = await serviceBonuses.readBonusMatchingStars(stars_quantity);
        const paymentAmount = stars_quantity * stars.ONE_STAR_PRICE;

        this.addUserStep(ctx, {
            key: userSteps.SELECTED_STARS_OPTION,
            stars: stars_quantity,
            bonus,
            paymentAmount,
        });

        await uiUser.showSelectedStarsInfo(ctx, stars_quantity, bonus, should_edit);
    }

    async handleReceiverMyself(ctx) {
        const [_, type] = ctx.match[0].split('.');
        const username = ctx.update.callback_query.from.username;

        if (!username) {
            await ctx.answerCbQuery(ctx.i18n.t('cannot_get_username'), {
                show_alert: true
            });
            return;
        }

        switch (type) {
            case 'stars':
                // Validate username with Fragment API for stars
                const isStarsValid = await helpersHttp.searchUsernameForStarsFragment(username);
                if (!isStarsValid.ok) {
                    await ctx.answerCbQuery(ctx.i18n.t('username_not_found', { username }), {
                        show_alert: true
                    });
                    return;
                }
                await this.payForStars(ctx, username, true);
                break;
            case 'premium':
                // Validate username with Fragment API for premium
                const isValid = await helpersHttp.searchUsernameForPremiumFragment(username);
                if (!isValid.ok) {
                    await ctx.answerCbQuery(ctx.i18n.t('username_not_found', { username }), {
                        show_alert: true
                    });
                    return;
                }
                await this.payForPremium(ctx, username, true);
                break;
        }
    }

    async receiveUsername(ctx, username, is_for = receivedUsernameFor.STARS) {
        const userName = username.startsWith('@') ? username.slice(1) : username;

        const isUsernameValid = is_for === receivedUsernameFor.PREMIUM
            ? await helpersHttp.searchUsernameForPremiumFragment(
                userName,
            )
            : await helpersHttp.searchUsernameForStarsFragment(
                userName,
            );

        if (!isUsernameValid.ok) {
            return await ctx.replyWithHTML(ctx.i18n.t('username_not_found', { username }));
        }

        if (is_for === receivedUsernameFor.PREMIUM) {
            await this.payForPremium(ctx, userName);

        } else if (is_for === receivedUsernameFor.STARS) {
            await this.payForStars(ctx, userName);

        } else {
            await this.payUserBalanceWithUsername(ctx, userName);
        }
    }

    async payForStars(ctx, username, should_edit = false) {
        const user = ctx.session.user;
        const { stars, bonus, paymentAmount } = helpersUser.getLastStep(ctx);

        this.addUserStep(ctx, {
            key: userSteps.STARS_PAYMENT_OPTIONS,
            stars,
            bonus,
            username,
            paymentAmount,
        },
        );

        const transaction = await serviceTransaction.create({
            user_id: user.id,
            quantity: stars,
            payment_amount: paymentAmount,
            receiver: username,
            token: helpersCrypto.generateToken()
        });

        const repliedMessage = await uiUser.payForStars(ctx, transaction, should_edit);
        const { result } = await helpersTelegram.sendOrderToChannel(ctx.i18n.t, transaction);

        if (result?.message_id) {
            await serviceTransaction.updateOneById(transaction.id, {
                message_id: result.message_id,
                user_message_id: repliedMessage?.message_id
            });
        }
    }

    async showMyProfile(ctx, should_edit = false) {
        const user = ctx.session.user;

        const [userBalance, referralsQuantity] = await Promise.all([
            serviceUsers.readUserBalance(user.id),
            serviceReferrals.readUserReferralsCount(user.id),
        ]);

        this.addUserStep(
            ctx, {
            key: userSteps.MY_PROFILE,
            balance: userBalance
        },
        );

        await uiUser.showMyProfile(
            ctx,
            { userBalance, referralsQuantity },
            should_edit,
        );
    }

    async retrieveBalance(ctx) {
        const { balance } = ctx.session.user.steps.at(-1)

        this.addUserStep(
            ctx, {
            key: userSteps.RETRIEVE_BALANCE,
        },
        );

        ctx.session.is_processing = false;

        await uiUser.showRetrieveBalanceOptions(ctx, balance);
    }

    async payUserBalance(ctx) {
        const user = ctx.session.user;
        const t = ctx.i18n.t;

        // If already processing, ignore further clicks
        if (ctx.session.is_processing) {
            await ctx.answerCbQuery(t('wait_for_process_to_finish'), { show_alert: true });
            return;
        }

        ctx.session.is_processing = true;

        try {
            // Add delay at the beginning if needed
            await new Promise(resolve => setTimeout(resolve, 3000));

            const [_, quantity] = ctx.update.callback_query.data.split('.');

            const balance = await serviceUsers.readUserBalance(user.id);
            const retrieving_balance = quantity === 'all' ? balance : +quantity;

            if (
                retrieving_balance < BALANCE_RETRIEVE_OPTIONS[0] ||
                retrieving_balance > balance
            ) {
                await ctx.answerCbQuery(t('balance_not_enough'), { show_alert: true });
                return;
            }

            const username = ctx.update.callback_query.from.username;
            if (!username) {
                await ctx.answerCbQuery(t('cannot_get_username'), { show_alert: true });
                return;
            }

            this.addUserStep(ctx, {
                key: userSteps.PAY_RETRIEVING_BALANCE,
                quantity: retrieving_balance,
            });

            await this.payUserBalanceWithUsername(ctx, username);

        } catch (error) {
            await ctx.answerCbQuery(t('unknow_error'), { show_alert: true });
        } finally {
            ctx.session.is_processing = false;
        }
    }

    async payUserBalance(ctx) {
        const user = ctx.session.user;
        const t = ctx.i18n.t;

        // If already processing, ignore further clicks
        if (ctx.session.is_processing) {
            await ctx.answerCbQuery(t('wait_for_process_to_finish'), { show_alert: true });
            return;
        }

        ctx.session.is_processing = true;

        try {
            const [_, quantity] = ctx.update.callback_query.data.split('.');

            const balance = await serviceUsers.readUserBalance(user.id);
            const retrieving_balance = quantity === 'all' ? balance : +quantity;

            if (
                retrieving_balance < BALANCE_RETRIEVE_OPTIONS[0] ||
                retrieving_balance > balance
            ) {
                await ctx.answerCbQuery(t('balance_not_enough'), { show_alert: true });
                return;
            }

            const username = ctx.update.callback_query.from.username;
            if (!username) {
                await ctx.answerCbQuery(t('cannot_get_username'), { show_alert: true });
                return;
            }

            this.addUserStep(ctx, {
                key: userSteps.PAY_RETRIEVING_BALANCE,
                quantity: retrieving_balance,
            });

            // This is the main async operation
            await this.payUserBalanceWithUsername(ctx, username);

        } catch (error) {
            console.error('Error in payUserBalance:', error);
            await ctx.answerCbQuery(t('unknow_error'), { show_alert: true });

        } finally {
            ctx.session.is_processing = false;
        }
    }

    async payUserBalanceWithUsername(ctx, username) {
        const t = ctx.i18n.t;
        const user = ctx.session.user;

        const { quantity } = ctx.session.user.steps.at(-1);

        try {
            const resp = await helpersHttp.getStarsFromFragment(username, quantity);

            if (resp.ok) {
                await serviceBonusPayment.create({
                    user_id: user.id,
                    amount: quantity,
                });

                await this.rollbackStep(ctx, -1);

                await ctx.replyWithHTML(
                    t('balance_retrieved_success', {
                        quantity: quantity,
                    })
                );
            } else {
                await ctx.answerCbQuery(t('unknow_error'), { show_alert: true });
            }
        } catch (error) {
            await ctx.answerCbQuery(t('unknow_error'), { show_alert: true });
        }
    }

    async showPremiumOptions(ctx, should_edit = false) {
        this.addUserStep(ctx, {
            key: userSteps.PREMIUM_OPTIONS,
        },
        );

        const premiumOptions = await servicePremium.readAll();

        await uiUser.showPremiumList(ctx, premiumOptions, should_edit);
    }

    async showSelectedPremiumInfo(ctx, premium_id) {
        const premiumInfo = await servicePremium.readOneById(premium_id);

        this.addUserStep(ctx, {
            key: userSteps.SELECTED_PREMIUM_OPTION,
            premium: premiumInfo,
        });

        await uiUser.showSelectedPremiumInfo(ctx, premiumInfo);
    }

    async payForPremium(ctx, username, should_edit = false) {
        const user = ctx.session.user;
        const { premium } = helpersUser.getLastStep(ctx);

        this.addUserStep(ctx, {
            key: userSteps.PREMIUM_PAYMENT_OPTIONS,
            premium: premium,
            username,
        });

        const transaction = await serviceTransaction.create({
            user_id: user.id,
            quantity: premium.duration,
            payment_amount: premium.price_sum,
            receiver: username,
            is_for: productTypes.PREMIUM,
        });

        const repliedMessage = await uiUser.payForPremium(ctx, premium, username, transaction, should_edit);
        const { result } = await helpersTelegram.sendOrderToChannel(ctx.i18n.t, transaction);

        if (result?.message_id) {
            await serviceTransaction.updateOneById(transaction.id, {
                message_id: result.message_id,
                user_message_id: repliedMessage?.message_id
            });
        }
    }

    async payForPremiumByStars(ctx) {
        const user = ctx.session.user;
        const t = ctx.i18n.t;
        const { premium, username } = helpersUser.getLastStep(ctx);

        const balance = await serviceUsers.readUserBalance(user.id);

        if (balance < premium.price_stars) {
            await ctx.answerCbQuery(
                ctx.i18n.t('balance_is_not_enough_for_premium', {
                    balance: user.balance,
                    price_stars: premium.price_stars,
                }),
                {
                    show_alert: true
                }
            );
            return;
        }

        // Use Fragment API for premium purchase
        const resp = await helpersHttp.getPremiumFromFragment(
            username,
            premium.duration,
        );

        let message;

        if (resp.ok) {
            message = t('premium_given_success', {
                months: premium.duration,
            });

            await serviceBonusPayment.create({
                user_id: user.id,
                amount: premium.price_stars,
            });

            await this.rollbackStep(ctx, -1);

        } else {
            message = t('unknow_error');
        }

        await ctx.replyWithHTML(message);
    }

    async sendOffers(ctx) {
        this.addUserStep(ctx, {
            key: userSteps.USER_OFFERS,
        });

        await uiUser.sendOffers(ctx);
    }

    async receiveUserOffers(ctx, text) {
        const user = ctx.session.user;
        const userLang = user.lang;
        ctx.i18n.t(GROUP_MESSAGES_LANGUAGE);

        await helpersTelegram.sendMessageToUser(
            GROUP_ID,
            helpersUser.formatUserOffer(
                ctx.i18n.t,
                user,
                text,
            ),
        );

        ctx.i18n.t(userLang);

        await uiMain.menu(ctx, ctx.i18n.t('request_sent_success'));
    }
}

module.exports = new ControllerUser();
