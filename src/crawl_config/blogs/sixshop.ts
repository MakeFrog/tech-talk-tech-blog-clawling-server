import { BlogConfig } from '../../types';
import { mediumPlatform } from '../platforms/medium';

const sixshopConfig: BlogConfig = {
    id: 'sixshop',
    name: '식스샵',
    feedUrl: 'https://medium.com/feed/sixshop',
    authorSelector: '.author',
    platform: 'medium',
    extractContent: mediumPlatform.extractContent,
    extractThumbnail: mediumPlatform.extractThumbnail
};

export default sixshopConfig; 