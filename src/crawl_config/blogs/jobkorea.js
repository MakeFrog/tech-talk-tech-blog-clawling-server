const mediumPlatform = require('../platforms/medium');

const jobkoreaConfig = {
    id: 'jobkorea',
    name: '잡코리아 테크블로그',
    feedUrl: 'https://medium.com/feed/jobkorea-tech',
    authorSelector: '.author',
    platform: 'medium',

    // Medium 플랫폼의 메서드 상속
    extractContent: mediumPlatform.extractContent,
    extractThumbnail: mediumPlatform.extractThumbnail
};

module.exports = jobkoreaConfig; 