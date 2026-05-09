const knex = require('knex');
const conn = require('./knexfile');

module.exports = knex(conn[process.env.NODE_ENV || 'development']);

