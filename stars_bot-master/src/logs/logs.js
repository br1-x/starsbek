const fs = require('fs');
const dayjs = require('dayjs');
const path = require('path');

const logFile = path.join(__dirname, 'error.log');

module.exports.logError = (errorMessage) => {
    const timestamp = dayjs().format('DD-MM-YYYY HH:mm:ss');
    const logMessage = `[${timestamp}] ERROR: ${errorMessage}\n`;

    fs.appendFile(logFile, logMessage, (err) => {
        if (err) console.error('Log yozishda xatolik:', err);
    });
};