import { BlogConfig } from '../../types';
import { mediumPlatform } from '../platforms/medium';

const musinsaConfig: BlogConfig = {
    id: 'musinsa',
    name: '무신사 테크블로그',
    feedUrl: 'https://medium.com/feed/musinsa-tech',
    authorSelector: '.author',
    platform: 'medium',
    extractContent: mediumPlatform.extractContent,
    extractThumbnail: mediumPlatform.extractThumbnail
};

export default musinsaConfig; 