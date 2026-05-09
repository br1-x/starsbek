const express = require('express');
const route = express.Router();
const controller = require('./controller');

function parseFields(req, res, next) {
    const numericFields = [
        'click_trans_id',
        'service_id',
        'merchant_trans_id',
        'click_paydoc_id',
        'amount',
        'action',
        'error',
    ];

    for (const field of numericFields) {
        if (req.body[field] !== undefined) {
            const parsed = Number(req.body[field]);
            req.body[field] = isNaN(parsed) ? req.body[field] : parsed;
        }
    }
    next();
}

route.post('/prepare', parseFields, controller.prepare.bind(controller));
route.post('/complete', parseFields, controller.complete.bind(controller));

module.exports = route;
