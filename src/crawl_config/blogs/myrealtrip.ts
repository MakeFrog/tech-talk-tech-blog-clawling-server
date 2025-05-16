import { BlogConfig } from '../../types';
import { mediumPlatform } from '../platforms/medium';

const myrealtripConfig: BlogConfig = {
    id: 'myrealtrip',
    name: '마이리얼트립 테크블로그',
    feedUrl: 'https://medium.com/feed/myrealtrip-product',
    authorSelector: '.author',
    platform: 'medium',
    extractContent: mediumPlatform.extractContent,
    extractThumbnail: mediumPlatform.extractThumbnail
};

export default myrealtripConfig; 