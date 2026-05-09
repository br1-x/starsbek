module.exports = {
    development: {
        client: 'mysql2',
        connection: {
            host: '127.0.0.1',
            user: 'root',
            password: 'Asadbek0929$!',
            database: 'db_stars_bot',
        },
        migrations: {
            directory: './migrations',
        },
        seeds: {
            directory: './seeds',
        },
    },

    production: {
        client: 'mysql2',
        connection: {
            host: '127.0.0.1',
            user: 'root',
            password: 'Asadbek0929$!',
            database: 'db_stars_bot',
        },
        migrations: {
            directory: './migrations',
        },
        seeds: {
            directory: './seeds',
        },
    },
};
