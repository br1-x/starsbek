const {logError} = require('../logs/logs');
const telegramHelpers = require('../helpers/helpers.telegram');
const {ADMIN_ID} = require('../config');

exports.errorHandler = async (ctx, next) => {
    try {
        await next();
    } catch (e) {
        // console.log(e);
        logError(`Internal error => ${e.toString()}`);
        // It will send information about the following error to the admin...
        await telegramHelpers.sendMessageToUser(ADMIN_ID, e.toString());
    }
};