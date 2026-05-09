const axios = require('axios');
const { fragmentApi } = require('../config');

const apiFragment = axios.create({
    baseURL: 'https://tg.parssms.info',
});

apiFragment.defaults.headers.common['api-key'] = `b53882bb-dfe7-4b12-8752-aa3a9c9496ec`;

// Fragment API for premium and stars
const fragmentApiInstance = axios.create({
    baseURL: fragmentApi.BASE_URL,
});

if (fragmentApi.API_KEY) {
    fragmentApiInstance.defaults.headers.common['Authorization'] = `Bearer ${fragmentApi.API_KEY}`;
}
fragmentApiInstance.defaults.headers.common['Content-Type'] = 'application/json';

class HelpersHttp {
    async getStars(username, quantity) {
        const res = await apiFragment.post('/v1/stars/payment', {
            query: username,
            quantity: String(quantity),
        });

        return res.data;
    }

    async searchUsernameForStars(username, quantity) {
        const res = await apiFragment.post('/v1/stars/search', {
            query: username,
            quantity: String(quantity),
        });

        return res.data;
    }

    async getPremium(username, months) {
        const res = await apiFragment.post('/v1/premium/payment', {
            query: username,
            months: String(months),
        });

        return res.data;
    }

    async searchUsernameForPremium(username, months) {
        const res = await apiFragment.post('/v1/premium/search', {
            query: username,
            months: String(months),
        });

        return res.data;
    }

    // Fragment API methods for premium
    async getPremiumFromFragment(username, months) {
        try {
            const res = await fragmentApiInstance.post('/api/premium/purchase', {
                username: username,
                months: months,
            });

            return {
                ok: res.data?.success || res.data?.ok || false,
                data: res.data,
            };
        } catch (error) {
            console.error('Fragment API premium error:', error.response?.data || error.message);
            return {
                ok: false,
                error: error.response?.data || error.message,
            };
        }
    }

    async searchUsernameForPremiumFragment(username) {
        try {
            const res = await fragmentApiInstance.post('/api/premium/search', {
                username: username,
            });

            return {
                ok: res.data?.success || res.data?.ok || false,
                data: res.data,
            };
        } catch (error) {
            console.error('Fragment API search error:', error.response?.data || error.message);
            return {
                ok: false,
                error: error.response?.data || error.message,
            };
        }
    }

    // Fragment API methods for stars
    async getStarsFromFragment(username, quantity) {
        try {
            const res = await fragmentApiInstance.post('/api/stars/purchase', {
                username: username,
                quantity: quantity,
            });

            return {
                ok: res.data?.success || res.data?.ok || false,
                data: res.data,
            };
        } catch (error) {
            console.error('Fragment API stars error:', error.response?.data || error.message);
            return {
                ok: false,
                error: error.response?.data || error.message,
            };
        }
    }

    async searchUsernameForStarsFragment(username) {
        try {
            const res = await fragmentApiInstance.post('/api/stars/search', {
                username: username,
            });

            return {
                ok: res.data?.success || res.data?.ok || false,
                data: res.data,
            };
        } catch (error) {
            console.error('Fragment API stars search error:', error.response?.data || error.message);
            return {
                ok: false,
                error: error.response?.data || error.message,
            };
        }
    }
}

module.exports = new HelpersHttp();