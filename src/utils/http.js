const axios = require('axios');

// axios 기본 설정
const axiosInstance = axios.create({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    },
    timeout: 10000
});

module.exports = {
    axiosInstance
}; 