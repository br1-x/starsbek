const serviceUsers = require('../../service/service.user');
const crypto = require('crypto');

const updateUserToken = async () => {
    const all_users = await serviceUsers.readAll();

    for (const user of all_users) {
        await serviceUsers.updateOneById(user.id, {
            token: crypto.randomBytes(15).toString('hex'),
        });
    }
};

updateUserToken();