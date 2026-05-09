const serviceTransaction = require('../service/service.transaction');
const db = require('../db/db');
const {productTypes, statuses, paymentMethods, bonusPurposeTypes} = require('../constant/constant.common');
const helpersHttp = require('../helpers/helpers.http');
const helpersTelegram = require('../helpers/helpers.telegram');
const {logError} = require('../logs/logs');
const {GROUP_MESSAGES_LANGUAGE, GROUP_ID, DEFAULT_LANGUAGE} = require('../config');
const serviceBonuses = require('../service/service.bonus');
const serviceUserBonuses = require('../service/service.userBonus');
const {helpersStars} = require('../helpers');
const uiMain = require('../ui/ui.main');
const path = require('node:path');
const {createStandaloneTranslator} = require('../libs/i18n');

const translator = createStandaloneTranslator({
    directory: path.join(__dirname, '../locales'),
});

class ControllerPayment {
    /**
     * Common helper: process bonuses for STARS payment
     */
    async #paymentForStars(t, transactionInfo) {
        const resp = await helpersHttp.getStarsFromFragment(transactionInfo.receiver, transactionInfo.quantity);

        // Direct bonus
        const matchingUserBonus = await serviceBonuses.readBonusMatchingStars(transactionInfo.quantity);
        const userBonus = helpersStars.calculateBonus(transactionInfo.quantity, matchingUserBonus);

        if (userBonus > 0) {
            await serviceUserBonuses.create({
                user_id: transactionInfo.user_id,
                transaction_id: transactionInfo.id,
                bonus: userBonus,
                source: bonusPurposeTypes.STARS,
            });
        }

        // Referral bonus
        if (transactionInfo.sender_id) {
            const matchingRefBonus = await serviceBonuses.readBonusMatchingStars(
                transactionInfo.quantity,
                bonusPurposeTypes.REFERRAL,
            );

            const refBonus = helpersStars.calculateBonus(transactionInfo.quantity, matchingRefBonus);

            if (refBonus > 0) {
                await serviceUserBonuses.create({
                    user_id: transactionInfo.sender_id,
                    transaction_id: transactionInfo.id,
                    bonus: refBonus,
                    source: bonusPurposeTypes.REFERRAL,
                });

                await helpersTelegram
                    .sendMessageToUser(
                        transactionInfo.sender_chat_id,
                        t('referral_sender_bonus', {
                            buyer_name: [transactionInfo.first_name, transactionInfo.last_name].filter(Boolean).join(' '),
                            stars: refBonus,
                        }),
                    )
                    .catch((e) => logError(e.toString()));
            }
        }

        return {
            resp,
            message: t('stars_given_success', {lng: transactionInfo.lang, quantity: transactionInfo.quantity}),
        };
    }

    /**
     * Common helper: process PREMIUM payment
     */
    async #paymentForPremium(t, transactionInfo) {
        const resp = await helpersHttp.getPremiumFromFragment(transactionInfo.receiver, transactionInfo.quantity);
        return {
            resp,
            message: t('premium_given_success', {lng: transactionInfo.lang, months: transactionInfo.quantity}),
        };
    }

    /**
     * Helper: finalize transaction update and channel notifications
     */
    async #finalizeTransaction(transactionInfo, resp, t, lang) {
        const data = {
            transaction_id: resp.transaction_id || null,
            is_done: resp.ok,
            ...(resp.ok ? {done_at: db.fn.now()} : {}),
        };

        await serviceTransaction.updateOneById(transactionInfo.id, data);
        transactionInfo = await serviceTransaction.readWithUserInfo(transactionInfo.id);

        await helpersTelegram.sendOrderToChannel(
            (key, vars) => translator.t(GROUP_MESSAGES_LANGUAGE, key, vars),
            transactionInfo,
            data.is_done ? statuses.SUCCESS : statuses.FAILED,
            true,
        );
    }

    /**
     * Unified payment processor
     */
    async #processPayment(transactionInfo, t, paymentMethod, tg_payment_id = null, ctx = null) {
        try {
            // update base payment info
            await serviceTransaction.updateOneById(transactionInfo.id, {
                payment_method: paymentMethod,
                is_paid: true,
                paid_at: db.fn.now(),
                ...(tg_payment_id && {tg_payment_id}),
            });

            // run type-specific flow
            const result =
                transactionInfo.is_for === productTypes.STARS
                    ? await this.#paymentForStars(t, transactionInfo)
                    : await this.#paymentForPremium(t, transactionInfo);

            const {resp, message} = result;

            // Send user notification
            if (ctx) {
                await uiMain.menu(ctx, message); // For PAYME
            } else {
                await helpersTelegram.sendMessageToUser(transactionInfo.chat_id, message); // For CLICK
            }

            // Delete old payment message
            await helpersTelegram
                .deleteMessage(transactionInfo.chat_id, transactionInfo.user_message_id)
                .catch((e) => logError(e.toString()));

            // Finalize transaction
            await this.#finalizeTransaction(transactionInfo, resp, t, transactionInfo.lang);

            return true;
        } catch (e) {
            logError(e.toString());

            const lang = transactionInfo?.lang || DEFAULT_LANGUAGE;
            const userT = (key, vars) => (ctx ? ctx.i18n.t(key, vars) : translator.t(lang, key, vars));

            // Notify user
            await helpersTelegram.sendMessageToUser(transactionInfo.chat_id, userT('failed_purchase_text_for_user'));

            // Notify admins
            const adminText = translator
                .t(GROUP_MESSAGES_LANGUAGE, 'failed_purchase_text_for_admin', {
                    trans_id: transactionInfo.id,
                    buyer_id: transactionInfo.user_id,
                    buyer_name: [transactionInfo.first_name, transactionInfo.last_name, transactionInfo.username]
                        .filter(Boolean)
                        .join(' '),
                    order: transactionInfo.is_for,
                    quantity: transactionInfo.quantity,
                    price: transactionInfo.payment_amount,
                    receiver: transactionInfo.receiver,
                })
                .concat(`\n\n⚠️ Error: ${e.toString()}`);

            await helpersTelegram.sendMessageToUser(GROUP_ID, adminText);

            return false;
        }
    }

    /**
     * Accept Click payment
     */
    async acceptPaymentClick(trans_id) {
        const transactionInfo = await serviceTransaction.readWithUserInfo(trans_id);
        if (!transactionInfo || transactionInfo.is_done === 1) return;

        const userLang = transactionInfo.lang || DEFAULT_LANGUAGE;
        const t = (key, vars) => translator.t(userLang, key, vars);

        return this.#processPayment(transactionInfo, t, paymentMethods.CLICK);
    }
}

module.exports = new ControllerPayment();
