const Joi = require('joi');
const {stars} = require('../config');

module.exports.starsQuantitySchema = Joi
    .number()
    .integer()
    .min(stars.MIN_STARS_QUANTITY)
    .max(stars.MAX_STARS_QUANTITY)
    .required();