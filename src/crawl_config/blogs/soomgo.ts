import { BlogConfig } from '../../types';
import { mediumPlatform } from '../platforms/medium';

const soomgoConfig: BlogConfig = {
    id: 'soomgo',
    name: '숨고',
    feedUrl: 'https://medium.com/feed/soomgo-tech',
    authorSelector: '.author',
    platform: 'medium',
    extractContent: mediumPlatform.extractContent,
    extractThumbnail: mediumPlatform.extractThumbnail
};

export default soomgoConfig; 