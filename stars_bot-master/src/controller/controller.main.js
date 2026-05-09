const uiMain = require('../ui/ui.main');
const {helpersUser} = require('../helpers');

class ControllerMain {
    async changeLang(ctx) {
        await uiMain.removeKeyboardButtons(ctx);

        await uiMain.selectLanguage(ctx);
    }

    async replyToUserMessage(ctx, message) {
        const {text} = message.reply_to_message;

        const chatId = helpersUser.extractId(text);

        if (!chatId) {
            throw new Error('Chat ID not found.');
        }

        // If the message contains text
        if (message.text) {
            await ctx.telegram.sendMessage(chatId, message.text, {parse_mode: 'HTML'});
        }

        // If the message contains a document (file) with or without a caption
        if (message.document) {
            await ctx.telegram.sendDocument(chatId, message.document.file_id, {
                caption: message.caption || '',
                parse_mode: 'HTML',
            });
        }

        // If the message contains a photo (send the highest resolution) with or without a caption
        if (message.photo) {
            const highestResPhoto = message.photo[message.photo.length - 1].file_id;
            await ctx.telegram.sendPhoto(chatId, highestResPhoto, {
                caption: message.caption || '',
                parse_mode: 'HTML',
            });
        }

        // If the message contains a video with or without a caption
        if (message.video) {
            await ctx.telegram.sendVideo(chatId, message.video.file_id, {
                caption: message.caption || '',
                parse_mode: 'HTML',
            });
        }

        // If the message contains a voice message (without caption, as voice messages don't support captions)
        if (message.voice) {
            await ctx.telegram.sendVoice(chatId, message.voice.file_id);
        }

        // If the message contains an audio file with or without a caption
        if (message.audio) {
            await ctx.telegram.sendAudio(chatId, message.audio.file_id, {
                caption: message.caption || '',
                parse_mode: 'HTML',
            });
        }

        // If the message contains a sticker (stickers don't support captions)
        if (message.sticker) {
            await ctx.telegram.sendSticker(chatId, message.sticker.file_id);
        }
    }
}

module.exports = new ControllerMain();