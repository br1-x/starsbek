const {Telegraf} = require('telegraf');
const RedisSession = require('telegraf-session-redis');

const updateHandler = require('./middleware/middleware.updateHandler');
const checkMembership = require('./middleware/middleware.checkMembership');
const {BOT_TOKEN, DEFAULT_LANGUAGE} = require('./config');
const BotMain = require('./bot/bot.main');
const path = require('path');
const {errorHandler} = require('./middleware/middleware.errorHandler');
const {createI18nMiddleware} = require('./libs/i18n');

const bot = new Telegraf(BOT_TOKEN);

const i18nMiddleware = createI18nMiddleware({
    defaultLocale: DEFAULT_LANGUAGE,
    directory: path.resolve(__dirname + '/locales'),
});

const session = new RedisSession({
    store: {
        host: '127.0.0.1',
        port: 6379,
        ttl: 7 * 24 * 60 * 60,  // 7 days
    },
});

bot.use(session.middleware());
bot.use(i18nMiddleware);

bot.use(errorHandler);
bot.use(updateHandler);
bot.use(checkMembership);

new BotMain(bot);

bot.catch((err, ctx) => {
    console.error(`Bot error for ${ctx.updateType}`, err);
});

module.exports = bot;

