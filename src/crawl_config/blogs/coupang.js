const mediumPlatform = require('../platforms/medium');

const coupangConfig = {
    id: 'coupang',
    name: '쿠팡 테크블로그',
    feedUrl: 'https://medium.com/feed/coupang-engineering',
    authorSelector: '.author',
    platform: 'medium',

    // Medium 플랫폼의 메서드 상속
    extractContent: mediumPlatform.extractContent,
    extractThumbnail: mediumPlatform.extractThumbnail
};

module.exports = coupangConfig; 