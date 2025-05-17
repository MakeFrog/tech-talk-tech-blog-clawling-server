import { BlogConfig } from '../../types';
import { mediumPlatform } from '../platforms/medium';

const watchaConfig: BlogConfig = {
    id: 'watcha',
    name: 'WATCHA',
    feedUrl: 'https://medium.com/feed/watcha',
    authorSelector: '.author',
    platform: 'medium',
    extractContent: mediumPlatform.extractContent,
    extractThumbnail: mediumPlatform.extractThumbnail
};

export default watchaConfig; 