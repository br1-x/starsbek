const pluginJs = require('@eslint/js');
const globals = require('globals');

module.exports = [
    {
        files: ['**/*.{js,cjs}'],
        plugins: {
            js: pluginJs,
        },
        languageOptions: {
            globals: globals.node,
            sourceType: 'commonjs',
            ecmaVersion: 'latest',
        },
    },
];
