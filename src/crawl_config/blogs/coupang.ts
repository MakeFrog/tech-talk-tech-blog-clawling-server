import { BlogConfig } from '../../types';
import { mediumPlatform } from '../platforms/medium';

const coupangConfig: BlogConfig = {
    id: 'coupang',
    name: '쿠팡',
    feedUrl: 'https://medium.com/feed/coupang-engineering',
    authorSelector: '.author',
    platform: 'medium',
    extractContent: mediumPlatform.extractContent,
    extractThumbnail: mediumPlatform.extractThumbnail
};

export default coupangConfig; 