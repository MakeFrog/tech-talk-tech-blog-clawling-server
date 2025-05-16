import { BlogConfig } from '../../types';
import { mediumPlatform } from '../platforms/medium';

const tvingConfig: BlogConfig = {
    id: 'tving',
    name: '티빙 테크블로그',
    feedUrl: 'https://medium.com/feed/tving-team',
    authorSelector: '.author',
    platform: 'medium',
    extractContent: mediumPlatform.extractContent,
    extractThumbnail: mediumPlatform.extractThumbnail
};

export default tvingConfig; 