import { BlogConfig } from '../../types';
import { mediumPlatform } from '../platforms/medium';

const chunmyungConfig: BlogConfig = {
    id: 'chunmyung',
    name: '천명앤컴퍼니 테크블로그',
    feedUrl: 'https://medium.com/feed/chunmyung',
    authorSelector: '.author',
    platform: 'medium',
    extractContent: mediumPlatform.extractContent,
    extractThumbnail: mediumPlatform.extractThumbnail
};

export default chunmyungConfig; 