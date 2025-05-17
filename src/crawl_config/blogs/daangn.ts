import { BlogConfig } from '../../types';
import { mediumPlatform } from '../platforms/medium';

const daangnConfig: BlogConfig = {
    id: 'daangn',
    name: '당근마켓',
    feedUrl: 'https://medium.com/feed/daangn',
    authorSelector: '.author',
    platform: 'medium',
    extractContent: mediumPlatform.extractContent,
    extractThumbnail: mediumPlatform.extractThumbnail
};

export default daangnConfig; 