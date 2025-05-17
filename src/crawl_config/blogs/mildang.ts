import { BlogConfig } from '../../types';
import { mediumPlatform } from '../platforms/medium';

const mildangConfig: BlogConfig = {
    id: 'mildang',
    name: '밀당',
    feedUrl: 'https://medium.com/feed/mildang',
    authorSelector: '.author',
    platform: 'medium',
    extractContent: mediumPlatform.extractContent,
    extractThumbnail: mediumPlatform.extractThumbnail
};

export default mildangConfig; 