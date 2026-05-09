const serviceClickTransaction = require('../../service/service.clickTransactions');
const {statusTypes} = require('./enum');
const dayjs = require('dayjs');
const paymentController = require('../../controller/controller.payment');
const {logError} = require('../../logs/logs');

class ClickPaymentController {
    static ERROR_CODES = {
        SUCCESS: 0,
        SIGNATURE_VERIFICATION_ERROR: -1,
        INVALID_PAYMENT_AMOUNT: -2,
        ACTION_NOT_FOUND: -3,
        ALREADY_PAID: -4,
        USER_DONT_EXIST: -5,
        TRANSACTION_NOT_FOUND: -6,
        USER_EDIT_ERROR: -7,
        CLICK_REQUEST_ERROR: -8,
        TRANSACTION_CANCELLED: -9,
    };

    _sendError(res, errorCode, errorNote) {
        res.json({
            error: errorCode,
            error_note: errorNote,
        });
    }

    _validateAction(action, expectedAction, res) {
        if (action !== expectedAction) {
            this._sendError(res, ClickPaymentController.ERROR_CODES.ACTION_NOT_FOUND, 'Action Not Found');
            return false;
        }
        return true;
    }

    async _handleClickError(merchant_trans_id, click_trans_id, service_id, click_paydoc_id, sign_string, merchant_prepare_id, res) {
        const updateData = {
            current_status: statusTypes.CANCELLED,
            cancelled_at: dayjs().toDate(),
        };

        if (merchant_prepare_id) {
            await serviceClickTransaction.updateOneById(merchant_prepare_id, updateData);
        } else {
            await serviceClickTransaction.createOrUpdate({
                user_transaction_id: merchant_trans_id,
                click_trans_id,
                service_id,
                click_paydoc_id,
                sign_string,
                ...updateData,
            });
        }

        this._sendError(res, ClickPaymentController.ERROR_CODES.CLICK_REQUEST_ERROR, 'Error in click request');
    }

    _validateTransaction(transaction, amount, res) {
        if (!transaction) {
            this._sendError(res, ClickPaymentController.ERROR_CODES.TRANSACTION_NOT_FOUND, 'Transaction not found');
            return false;
        }

        if (transaction.current_status === statusTypes.CANCELLED) {
            this._sendError(res, ClickPaymentController.ERROR_CODES.TRANSACTION_CANCELLED, 'Transaction cancelled');
            return false;
        }

        if (transaction.current_status === statusTypes.CONFIRMED || transaction.is_paid === 1) {
            this._sendError(res, ClickPaymentController.ERROR_CODES.ALREADY_PAID, 'Already paid');
            return false;
        }

        if (transaction.payment_amount !== amount) {
            this._sendError(res, ClickPaymentController.ERROR_CODES.INVALID_PAYMENT_AMOUNT, 'Invalid payment amount');
            return false;
        }

        return true;
    }

    async prepare(req, res) {
        const {
            click_trans_id,
            service_id,
            merchant_trans_id,
            click_paydoc_id,
            amount,
            action,
            error,
            sign_string,
        } = req.body;

        // Validate action
        if (!this._validateAction(action, 0, res)) return;

        // Handle Click error
        if (error < 0) {
            await this._handleClickError(merchant_trans_id, click_trans_id, service_id, click_paydoc_id, sign_string, null, res);
            return;
        }

        try {
            const transaction = await serviceClickTransaction.readByUserTransactionId(+merchant_trans_id);

            // Validate transaction
            if (!this._validateTransaction(transaction, amount, res)) return;

            // Create prepare record
            const [prepareId] = await serviceClickTransaction.create({
                user_transaction_id: merchant_trans_id,
                click_trans_id,
                service_id,
                click_paydoc_id,
                sign_string,
            });

            res.json({
                click_trans_id,
                merchant_trans_id,
                merchant_prepare_id: prepareId,
                error: ClickPaymentController.ERROR_CODES.SUCCESS,
                error_note: 'Success',
            });

        } catch (err) {
            logError(err);
            this._sendError(res, ClickPaymentController.ERROR_CODES.USER_EDIT_ERROR, 'Server error occurred');
        }
    }

    async complete(req, res) {
        const {
            click_trans_id,
            merchant_trans_id,
            merchant_prepare_id,
            amount,
            action,
            error,
            service_id,
            click_paydoc_id,
            sign_string,
        } = req.body;

        // Validate action
        if (!this._validateAction(action, 1, res)) return;

        // Handle Click error
        if (error < 0) {
            await this._handleClickError(merchant_trans_id, click_trans_id, service_id, click_paydoc_id, sign_string, merchant_prepare_id, res);
            return;
        }

        try {
            const transaction = await serviceClickTransaction.readByUserTransactionId(+merchant_trans_id);

            // Validate transaction
            if (!this._validateTransaction(transaction, amount, res)) return;

            // Process payment
            const isSuccess = await paymentController.acceptPaymentClick(merchant_trans_id);

            if (!isSuccess) {
                this._sendError(res, ClickPaymentController.ERROR_CODES.USER_EDIT_ERROR, 'Server error occurred');
                return;
            }

            await serviceClickTransaction.updateOneById(merchant_prepare_id, {
                current_status: statusTypes.CONFIRMED,
                completed_at: dayjs().toDate(),
            });

            res.json({
                click_trans_id,
                merchant_trans_id,
                merchant_confirm_id: null,
                error: ClickPaymentController.ERROR_CODES.SUCCESS,
                error_note: 'Success',
            });

        } catch (err) {
            logError(`Complete error: ${err}`);
            this._sendError(res, ClickPaymentController.ERROR_CODES.USER_EDIT_ERROR, 'Server error occurred');
        }
    }
}

module.exports = new ClickPaymentController();