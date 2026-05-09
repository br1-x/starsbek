const uiAdmin = require('../ui/ui.admin');
const uiMain = require('../ui/ui.main');

class ControllerMain {
    async createPost(ctx) {
        if (ctx.session.admin) {
            ctx.session.menu = 'send_post';
            uiAdmin.requestPost(ctx);

        } else {
            await uiMain.menu(ctx);
        }
    }
}

module.exports = new ControllerMain();