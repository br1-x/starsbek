const crypto = require('crypto');
const KEY = crypto.scryptSync("dKHKS78b##@$sa&$23", 'salt', 32);

class HelpersCrypto {
    encrypt(text) {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
        const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        return `${iv.toString('hex')}.${enc.toString('hex')}.${tag.toString('hex')}`;
    }

    decrypt(token) {
        const [ivHex, encHex, tagHex] = token.split('.');
        const iv = Buffer.from(ivHex, 'hex');
        const enc = Buffer.from(encHex, 'hex');
        const tag = Buffer.from(tagHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
        decipher.setAuthTag(tag);
        const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
        return dec.toString('utf8');
    }

    generateToken(bytes = 32) {
        return crypto.randomBytes(bytes).toString("base64url");
    }
}

module.exports = new HelpersCrypto();