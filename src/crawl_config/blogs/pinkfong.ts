import { BlogConfig } from '../../types';
import { mediumPlatform } from '../platforms/medium';

const pinkfongConfig: BlogConfig = {
    id: 'pinkfong',
    name: '더핑크퐁컴퍼니',
    feedUrl: 'https://medium.com/feed/pinkfong',
    authorSelector: '.author',
    platform: 'medium',
    extractContent: mediumPlatform.extractContent,
    extractThumbnail: mediumPlatform.extractThumbnail
};

export default pinkfongConfig; 